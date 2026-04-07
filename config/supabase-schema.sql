-- ============================================================
-- InstaFlow — Supabase PostgreSQL Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- USERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                      TEXT NOT NULL,
  email                     TEXT NOT NULL UNIQUE,
  password                  TEXT NOT NULL,
  role                      TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),

  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token  TEXT,
  email_verification_expires TIMESTAMPTZ,

  -- Instagram
  instagram_account_id      TEXT,
  instagram_username        TEXT,
  instagram_profile_picture TEXT,
  access_token              TEXT,          -- AES-encrypted
  access_token_expiry       TIMESTAMPTZ,
  instagram_connected       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Subscription
  subscription_status       TEXT NOT NULL DEFAULT 'inactive'
                              CHECK (subscription_status IN ('inactive','active','expired','cancelled','trial')),
  subscription_id           TEXT,
  razorpay_customer_id      TEXT,
  subscription_start        TIMESTAMPTZ,
  subscription_end          TIMESTAMPTZ,
  trial_end                 TIMESTAMPTZ,

  -- Password / OTP reset
  password_reset_token      TEXT,
  password_reset_expires    TIMESTAMPTZ,
  otp_code                  TEXT,
  otp_expires               TIMESTAMPTZ,

  -- Usage
  dms_sent_today            INTEGER NOT NULL DEFAULT 0,
  dms_sent_total            INTEGER NOT NULL DEFAULT 0,
  last_dm_reset             TIMESTAMPTZ DEFAULT NOW(),

  -- Preferences
  email_notifications       BOOLEAN NOT NULL DEFAULT TRUE,
  timezone                  TEXT NOT NULL DEFAULT 'Asia/Kolkata',

  last_login                TIMESTAMPTZ,
  last_active               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email               ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_instagram_account   ON users(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);

-- ────────────────────────────────────────────────────────────
-- CAMPAIGNS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('active','inactive','paused','draft')),

  selected_posts       JSONB NOT NULL DEFAULT '[]',
  message_template     TEXT NOT NULL,

  -- Smart rules
  keyword_triggers     TEXT[] DEFAULT '{}',
  use_keyword_trigger  BOOLEAN NOT NULL DEFAULT FALSE,
  ignore_duplicates    BOOLEAN NOT NULL DEFAULT TRUE,
  spam_filter          BOOLEAN NOT NULL DEFAULT TRUE,

  -- Delay (seconds)
  delay_min            INTEGER NOT NULL DEFAULT 5,
  delay_max            INTEGER NOT NULL DEFAULT 20,
  max_dms_per_day      INTEGER NOT NULL DEFAULT 100,

  -- Stats
  stat_total_comments  INTEGER NOT NULL DEFAULT 0,
  stat_dms_sent        INTEGER NOT NULL DEFAULT 0,
  stat_dms_failed      INTEGER NOT NULL DEFAULT 0,
  stat_conversions     INTEGER NOT NULL DEFAULT 0,

  -- Duplicate tracking: array of "commenterId_postId" strings
  replied_users        TEXT[] DEFAULT '{}',

  last_triggered_at    TIMESTAMPTZ,
  started_at           TIMESTAMPTZ,
  paused_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status  ON campaigns(status);

-- ────────────────────────────────────────────────────────────
-- LOGS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id           UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  post_id               TEXT,
  comment_id            TEXT,
  comment_text          TEXT,
  commenter_id          TEXT,
  commenter_username    TEXT,

  dm_status             TEXT NOT NULL DEFAULT 'pending'
                          CHECK (dm_status IN ('success','failed','skipped','pending','queued')),
  dm_message_id         TEXT,
  message_sent          TEXT,
  error_message         TEXT,
  error_code            TEXT,

  skip_reason           TEXT CHECK (skip_reason IN
                          ('duplicate','spam','no_keyword','subscription_expired','rate_limit','user_blocked') OR skip_reason IS NULL),

  comment_received_at   TIMESTAMPTZ,
  dm_sent_at            TIMESTAMPTZ,
  processing_delay_ms   INTEGER,

  job_id                TEXT,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_user_id    ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_dm_status  ON logs(dm_status);
CREATE INDEX IF NOT EXISTS idx_logs_comment_id ON logs(comment_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);

-- ────────────────────────────────────────────────────────────
-- PAYMENTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_payment_id      TEXT,
  razorpay_order_id        TEXT,
  razorpay_subscription_id TEXT,
  razorpay_signature       TEXT,

  amount                   INTEGER NOT NULL,   -- paise
  currency                 TEXT NOT NULL DEFAULT 'INR',
  status                   TEXT NOT NULL DEFAULT 'created'
                             CHECK (status IN ('created','authorized','captured','failed','refunded')),
  plan                     TEXT DEFAULT 'monthly',
  plan_amount              INTEGER,
  billing_cycle            TEXT DEFAULT 'monthly',

  period_start             TIMESTAMPTZ,
  period_end               TIMESTAMPTZ,
  invoice_url              TEXT,
  notes                    JSONB,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id           ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_id       ON payments(razorpay_payment_id);

-- ────────────────────────────────────────────────────────────
-- updated_at auto-trigger
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
    CREATE TRIGGER users_updated_at     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campaigns_updated_at') THEN
    CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payments_updated_at') THEN
    CREATE TRIGGER payments_updated_at  BEFORE UPDATE ON payments  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- Row Level Security (RLS) — optional, backend uses service key
-- so RLS won't block it, but good practice
-- ────────────────────────────────────────────────────────────
ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no extra policies needed
-- for backend usage. Frontend never hits DB directly.
