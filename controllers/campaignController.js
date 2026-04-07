const Campaign = require('../models/Campaign');
const Log = require('../models/Log');
const logger = require('../utils/logger');

exports.getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await Campaign.find({ userId: req.user._id });
    res.json({ success: true, campaigns });
  } catch (error) { next(error); }
};

exports.createCampaign = async (req, res, next) => {
  try {
    const { name, description, selectedPosts, messageTemplate, keywordTriggers, useKeywordTrigger, delayMin, delayMax, maxDmsPerDay, spamFilter } = req.body;
    if (!selectedPosts?.length) return res.status(400).json({ success: false, message: 'Select at least one post.' });
    const campaign = await Campaign.create({
      userId: req.user._id, name, description, selectedPosts, messageTemplate,
      keywordTriggers: keywordTriggers || [], useKeywordTrigger: useKeywordTrigger || false,
      delayMin: delayMin ?? 5, delayMax: delayMax ?? 20,
      maxDmsPerDay: maxDmsPerDay || 100, spamFilter: spamFilter !== false, status: 'draft',
    });
    res.status(201).json({ success: true, campaign });
  } catch (error) { next(error); }
};

exports.getCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    res.json({ success: true, campaign });
  } catch (error) { next(error); }
};

exports.updateCampaign = async (req, res, next) => {
  try {
    const { name, description, selectedPosts, messageTemplate, keywordTriggers, useKeywordTrigger, delayMin, delayMax, maxDmsPerDay, spamFilter } = req.body;
    const campaign = await Campaign.update(req.params.id, req.user._id, {
      name, description, selectedPosts, messageTemplate, keywordTriggers,
      useKeywordTrigger, delayMin, delayMax, maxDmsPerDay, spamFilter,
    });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    res.json({ success: true, campaign });
  } catch (error) { next(error); }
};

exports.toggleStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'paused'].includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    if (status === 'active' && !req.user.hasActiveSubscription())
      return res.status(403).json({ success: false, message: 'Active subscription required.', code: 'SUBSCRIPTION_REQUIRED' });
    if (status === 'active' && !req.user.instagramConnected)
      return res.status(403).json({ success: false, message: 'Connect Instagram account first.', code: 'INSTAGRAM_REQUIRED' });

    const updates = { status };
    if (status === 'active') updates.startedAt = new Date();
    if (status === 'paused') updates.pausedAt = new Date();

    const campaign = await Campaign.update(req.params.id, req.user._id, updates);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    logger.info(`Campaign ${req.params.id} → ${status}`);
    res.json({ success: true, campaign });
  } catch (error) { next(error); }
};

exports.deleteCampaign = async (req, res, next) => {
  try {
    await Campaign.delete(req.params.id, req.user._id);
    res.json({ success: true, message: 'Campaign deleted.' });
  } catch (error) { next(error); }
};

exports.getCampaignLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const { logs, total } = await Log.find({
      userId: req.user._id, campaignId: req.params.id,
      dmStatus: status, page: parseInt(page), limit: parseInt(limit),
    });
    res.json({ success: true, logs, total, page: parseInt(page) });
  } catch (error) { next(error); }
};
