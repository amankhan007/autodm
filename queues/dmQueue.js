const { Queue, Worker } = require('bullmq');
const axios = require('axios');
const Redis = require('ioredis');
require('dotenv').config();

const logger = require('../utils/logger');

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const GRAPH = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`;

// Queue instance — exported so controllers can add jobs
const dmQueue = new Queue('dm-automation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

module.exports = dmQueue;

// Worker only starts when this file is the entry point
if (require.main === module) {
  const connectDB = require('../config/database');
  const User = require('../models/User');
  const Campaign = require('../models/Campaign');
  const Log = require('../models/Log');

  (async () => {
    await connectDB();
    logger.info('✅ DM Worker: Supabase connected');

    const worker = new Worker(
      'dm-automation',
      async (job) => {
        const { logId, userId, campaignId, commenterId, commenterUsername, commentText, postId } = job.data;
        logger.info(`Processing job ${job.id} for @${commenterUsername}`);

        const [user, campaign] = await Promise.all([
          User.findById(userId),
          Campaign.findById(campaignId),
        ]);

        if (!user)     throw new Error('User not found');
        if (!campaign) throw new Error('Campaign not found');

        // Re-validate subscription
        if (!user.hasActiveSubscription()) {
          await Log.update(logId, { dmStatus: 'skipped', skipReason: 'subscription_expired' });
          return;
        }

        // Re-validate campaign still active
        if (campaign.status !== 'active') {
          await Log.update(logId, { dmStatus: 'skipped', errorMessage: 'Campaign deactivated' });
          return;
        }

        // Race-condition duplicate check
        if (campaign.hasReplied(commenterId, postId)) {
          await Log.update(logId, { dmStatus: 'skipped', skipReason: 'duplicate' });
          return;
        }

        const message = buildMessage(campaign.messageTemplate, {
          username: commenterUsername || 'there',
          comment: commentText || '',
        });

        const token = user.getAccessToken();
        const t0 = Date.now();

        try {
          const { data } = await axios.post(
            `${GRAPH}/${user.instagramAccountId}/messages`,
            { recipient: { id: commenterId }, message: { text: message } },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          const msgId = data.message_id || data.id;

          await Promise.all([
            Log.update(logId, {
              dmStatus: 'success', dmMessageId: msgId,
              messageSent: message, dmSentAt: new Date(),
              processingDelayMs: Date.now() - t0,
            }),
            Campaign.incrementStat(campaignId, 'dmsSent'),
            Campaign.update(campaignId, null, { lastTriggeredAt: new Date() }),
            User.incrementDms(userId),
            Campaign.addRepliedUser(campaignId, commenterId, postId),
          ]);

          logger.info(`✅ DM sent → @${commenterUsername} (job ${job.id}), id: ${msgId}`);

        } catch (apiErr) {
          const igErr = apiErr.response?.data?.error;
          const errMsg = (igErr?.message || apiErr.message).substring(0, 500);
          const errCode = String(igErr?.code || 'UNKNOWN');

          logger.error(`❌ DM failed (job ${job.id}): [${errCode}] ${errMsg}`);

          await Promise.all([
            Log.update(logId, {
              dmStatus: 'failed', errorMessage: errMsg,
              errorCode: errCode, retryCount: job.attemptsMade,
            }),
            Campaign.incrementStat(campaignId, 'dmsFailed'),
          ]);

          // Permanent errors — don't retry
          if ([100, 10, 200, 190].includes(igErr?.code)) {
            const e = new Error(`Non-retryable: ${errMsg}`);
            e.retryable = false;
            throw e;
          }
          throw apiErr;
        }
      },
      {
        connection: redisConnection,
        concurrency: 5,
        limiter: { max: 20, duration: 60000 }, // 20 DMs per minute max
      }
    );

    worker.on('completed', (job) => logger.info(`Job ${job.id} ✓`));
    worker.on('failed',    (job, err) => logger.error(`Job ${job?.id} ✗ ${err.message}`));
    worker.on('error',     (err) => logger.error('Worker error:', err));

    logger.info('🚀 InstaFlow DM Worker running (Supabase)');
  })();
}

function buildMessage(template, vars) {
  return template
    .replace(/\{\{username\}\}/g, vars.username)
    .replace(/\{\{comment\}\}/g,  vars.comment)
    .trim();
}
