const crypto = require('crypto');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const Log = require('../models/Log');
const dmQueue = require('../queues/dmQueue');
const logger = require('../utils/logger');

exports.verify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    logger.info('✅ Webhook verified by Meta');
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Forbidden' });
};

exports.handleEvent = async (req, res) => {
  res.status(200).json({ received: true });
  try {
    let body;
    if (Buffer.isBuffer(req.body)) {
      const sig = req.headers['x-hub-signature-256'];
      if (sig) {
        const expected = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(req.body).digest('hex');
        if (sig !== expected) { logger.warn('Webhook signature mismatch'); return; }
      }
      body = JSON.parse(req.body.toString());
    } else { body = req.body; }

    if (body.object !== 'instagram') return;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'comments') await handleComment(entry.id, change.value);
      }
    }
  } catch (error) { logger.error('Webhook error:', error); }
};

async function handleComment(igAccountId, commentData) {
  try {
    const { id: commentId, text: commentText, from, media } = commentData;
    logger.info(`New comment from @${from?.username}: "${String(commentText).substring(0, 60)}"`);

    const user = await User.findOne({ instagramAccountId: igAccountId });
    if (!user) { logger.warn(`No user for IG: ${igAccountId}`); return; }

    if (!user.hasActiveSubscription()) {
      await Log.create({ userId: user._id, commentId, commentText: String(commentText).substring(0, 500), commenterId: from?.id, commenterUsername: from?.username, postId: media?.id, dmStatus: 'skipped', skipReason: 'subscription_expired', commentReceivedAt: new Date() });
      return;
    }

    const campaigns = await Campaign.findActiveForPost(user._id, media?.id);
    if (!campaigns.length) return;

    for (const campaign of campaigns) {
      if (campaign.hasReplied(from?.id, media?.id)) {
        await Log.create({ userId: user._id, campaignId: campaign._id, commentId, commentText: String(commentText).substring(0, 500), commenterId: from?.id, commenterUsername: from?.username, postId: media?.id, dmStatus: 'skipped', skipReason: 'duplicate', commentReceivedAt: new Date() });
        continue;
      }

      if (campaign.useKeywordTrigger && campaign.keywordTriggers?.length) {
        const lower = String(commentText).toLowerCase();
        if (!campaign.keywordTriggers.some(kw => lower.includes(kw))) {
          await Log.create({ userId: user._id, campaignId: campaign._id, commentId, commentText: String(commentText).substring(0, 500), commenterId: from?.id, commenterUsername: from?.username, postId: media?.id, dmStatus: 'skipped', skipReason: 'no_keyword', commentReceivedAt: new Date() });
          continue;
        }
      }

      if (campaign.spamFilter && isSpam(commentText)) {
        await Log.create({ userId: user._id, campaignId: campaign._id, commentId, commentText: String(commentText).substring(0, 500), commenterId: from?.id, commenterUsername: from?.username, postId: media?.id, dmStatus: 'skipped', skipReason: 'spam', commentReceivedAt: new Date() });
        continue;
      }

      const log = await Log.create({ userId: user._id, campaignId: campaign._id, commentId, commentText: String(commentText).substring(0, 500), commenterId: from?.id, commenterUsername: from?.username, postId: media?.id, dmStatus: 'queued', commentReceivedAt: new Date() });
      await Campaign.incrementStat(campaign._id, 'totalComments');

      const delay = getRandomDelay(campaign.delayMin * 1000, campaign.delayMax * 1000);
      const job = await dmQueue.add('send-dm', {
        logId: log._id, userId: user._id, campaignId: campaign._id,
        commenterId: from?.id, commenterUsername: from?.username,
        commentText, postId: media?.id, igAccountId,
      }, { delay, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });

      await Log.update(log._id, { jobId: job.id });
      logger.info(`DM queued (job ${job.id}) for @${from?.username} with ${delay}ms delay`);
    }
  } catch (error) { logger.error('handleComment error:', error); }
}

const isSpam = (text) => !text ? false : [/^(👍|❤️|🔥|😍|✅)+$/, /follow\s+back/i, /check\s+my\s+profile/i, /earn\s+\$?\d+/i, /free\s+followers/i].some(p => p.test(text));
const getRandomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
