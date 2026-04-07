const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDB } = require('../config/database');

// ── Encryption helpers ─────────────────────────────────────────────────────────
const ENC_KEY = () => {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32));
};

function encryptToken(token) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY(), iv);
  return iv.toString('hex') + ':' + cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
}

function decryptToken(stored) {
  try {
    const [ivHex, enc] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY(), Buffer.from(ivHex, 'hex'));
    return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
  } catch { return null; }
}

// ── Row → App object mapper ────────────────────────────────────────────────────
function mapUser(row) {
  if (!row) return null;
  const u = {
    _id: row.id, id: row.id,
    name: row.name, email: row.email, role: row.role,
    isActive: row.is_active,
    isEmailVerified: row.is_email_verified,
    emailVerificationToken: row.email_verification_token,
    emailVerificationExpires: row.email_verification_expires,
    instagramAccountId: row.instagram_account_id,
    instagramUsername: row.instagram_username,
    instagramProfilePicture: row.instagram_profile_picture,
    accessToken: row.access_token,
    accessTokenExpiry: row.access_token_expiry,
    instagramConnected: row.instagram_connected,
    subscriptionStatus: row.subscription_status,
    subscriptionId: row.subscription_id,
    razorpayCustomerId: row.razorpay_customer_id,
    subscriptionStart: row.subscription_start,
    subscriptionEnd: row.subscription_end,
    trialEnd: row.trial_end,
    passwordResetToken: row.password_reset_token,
    passwordResetExpires: row.password_reset_expires,
    otpCode: row.otp_code,
    otpExpires: row.otp_expires,
    dmsSentToday: row.dms_sent_today,
    dmsSentTotal: row.dms_sent_total,
    emailNotifications: row.email_notifications,
    timezone: row.timezone,
    lastLogin: row.last_login,
    lastActive: row.last_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Virtual helpers
  u.hasActiveSubscription = function () {
    if (this.subscriptionStatus === 'active') {
      if (this.subscriptionEnd && new Date() > new Date(this.subscriptionEnd)) return false;
      return true;
    }
    if (this.subscriptionStatus === 'trial' && this.trialEnd)
      return new Date() < new Date(this.trialEnd);
    return false;
  };
  u.getAccessToken = function () {
    return this.accessToken ? decryptToken(this.accessToken) : null;
  };
  Object.defineProperty(u, 'daysRemaining', {
    get() {
      if (!this.subscriptionEnd) return 0;
      return Math.max(0, Math.ceil((new Date(this.subscriptionEnd) - new Date()) / 86400000));
    }
  });

  return u;
}

// ── camelCase → snake_case field map ─────────────────────────────────────────
const FIELD_MAP = {
  name: 'name', email: 'email', role: 'role',
  isActive: 'is_active', isEmailVerified: 'is_email_verified',
  emailVerificationToken: 'email_verification_token',
  emailVerificationExpires: 'email_verification_expires',
  instagramAccountId: 'instagram_account_id',
  instagramUsername: 'instagram_username',
  instagramProfilePicture: 'instagram_profile_picture',
  accessToken: 'access_token',
  accessTokenExpiry: 'access_token_expiry',
  instagramConnected: 'instagram_connected',
  subscriptionStatus: 'subscription_status',
  subscriptionId: 'subscription_id',
  razorpayCustomerId: 'razorpay_customer_id',
  subscriptionStart: 'subscription_start',
  subscriptionEnd: 'subscription_end',
  trialEnd: 'trial_end',
  passwordResetToken: 'password_reset_token',
  passwordResetExpires: 'password_reset_expires',
  otpCode: 'otp_code',
  otpExpires: 'otp_expires',
  dmsSentToday: 'dms_sent_today',
  dmsSentTotal: 'dms_sent_total',
  emailNotifications: 'email_notifications',
  timezone: 'timezone',
  lastLogin: 'last_login',
  lastActive: 'last_active',
};

function toPatch(fields) {
  const patch = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FIELD_MAP[k] && v !== undefined) patch[FIELD_MAP[k]] = v;
  }
  return patch;
}

// ── User model ────────────────────────────────────────────────────────────────
const User = {
  async findById(id) {
    const { data } = await getDB().from('users').select('*').eq('id', id).maybeSingle();
    return mapUser(data);
  },

  async findOne(query) {
    let q = getDB().from('users').select('*');
    if (query.email)              q = q.eq('email', query.email.toLowerCase());
    if (query.instagramAccountId) q = q.eq('instagram_account_id', query.instagramAccountId);
    if (query.subscriptionId)     q = q.eq('subscription_id', query.subscriptionId);
    if (query.passwordResetToken) q = q.eq('password_reset_token', query.passwordResetToken);
    if (query.otpCode)            q = q.eq('otp_code', query.otpCode);
    if (query.emailVerificationToken) q = q.eq('email_verification_token', query.emailVerificationToken);
    if (query.passwordResetExpires?.$gt)
      q = q.gt('password_reset_expires', new Date(query.passwordResetExpires.$gt).toISOString());
    if (query.otpExpires?.$gt)
      q = q.gt('otp_expires', new Date(query.otpExpires.$gt).toISOString());
    const { data } = await q.limit(1).maybeSingle();
    return mapUser(data);
  },

  // Returns raw row (with hashed password) for auth comparison
  async findRawByEmail(email) {
    const { data } = await getDB().from('users').select('*').eq('email', email.toLowerCase()).maybeSingle();
    return data;
  },

  async find(query = {}) {
    let q = getDB().from('users').select('*');
    if (query.instagramConnected !== undefined) q = q.eq('instagram_connected', query.instagramConnected);
    if (query.emailNotifications !== undefined) q = q.eq('email_notifications', query.emailNotifications);
    if (query.subscriptionStatus)              q = q.eq('subscription_status', query.subscriptionStatus);
    const { data } = await q;
    return (data || []).map(mapUser);
  },

  async findAdmin({ search, status, limit = 20, offset = 0 } = {}) {
    let q = getDB().from('users').select('*', { count: 'exact' });
    if (status) q = q.eq('subscription_status', status);
    if (search) q = q.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    const { data, count } = await q;
    return { users: (data || []).map(mapUser), total: count || 0 };
  },

  async create(fields) {
    const hashed = await bcrypt.hash(fields.password, 12);
    const { data, error } = await getDB().from('users').insert({
      name: fields.name,
      email: fields.email.toLowerCase(),
      password: hashed,
      role: fields.role || 'user',
      email_verification_token: fields.emailVerificationToken || null,
      email_verification_expires: fields.emailVerificationExpires || null,
      subscription_status: 'inactive',
      email_notifications: true,
      timezone: 'Asia/Kolkata',
    }).select().single();
    if (error) {
      const err = new Error(error.message);
      if (error.code === '23505') { err.code = 11000; err.keyValue = { email: fields.email }; }
      throw err;
    }
    return mapUser(data);
  },

  async update(id, fields) {
    const patch = toPatch(fields);
    if (Object.keys(patch).length === 0) return;
    const { error } = await getDB().from('users').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async updatePassword(id, newPassword) {
    const hashed = await bcrypt.hash(newPassword, 12);
    await getDB().from('users').update({
      password: hashed,
      password_reset_token: null,
      password_reset_expires: null,
    }).eq('id', id);
  },

  async setEncryptedToken(id, plainToken, expiry) {
    await getDB().from('users').update({
      access_token: encryptToken(plainToken),
      access_token_expiry: expiry ? new Date(expiry).toISOString() : null,
    }).eq('id', id);
  },

  async incrementDms(id) {
    // Use Supabase RPC (defined below) — fallback to a read-then-write
    const { data } = await getDB().from('users').select('dms_sent_today,dms_sent_total').eq('id', id).single();
    if (data) {
      await getDB().from('users').update({
        dms_sent_today: (data.dms_sent_today || 0) + 1,
        dms_sent_total: (data.dms_sent_total || 0) + 1,
      }).eq('id', id);
    }
  },

  async count(query = {}) {
    let q = getDB().from('users').select('*', { count: 'exact', head: true });
    if (query.subscriptionStatus) q = q.eq('subscription_status', query.subscriptionStatus);
    if (query.createdAt?.$gte)    q = q.gte('created_at', query.createdAt.$gte.toISOString());
    const { count } = await q;
    return count || 0;
  },

  comparePassword: (plain, hashed) => bcrypt.compare(plain, hashed),
};

module.exports = User;
module.exports.encryptToken = encryptToken;
module.exports.decryptToken = decryptToken;
