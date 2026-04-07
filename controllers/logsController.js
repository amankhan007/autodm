const { stringify } = require('csv-stringify');
const Log = require('../models/Log');

exports.getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, campaignId, from, to } = req.query;
    const { logs, total } = await Log.find({ userId: req.user._id, campaignId, dmStatus: status, from, to, page: parseInt(page), limit: parseInt(limit) });
    res.json({ success: true, logs, total, page: parseInt(page) });
  } catch (error) { next(error); }
};

exports.exportLogs = async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    const logs = await Log.exportAll({ userId: req.user._id, dmStatus: status, from, to });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=instaflow-logs-${Date.now()}.csv`);
    stringify(logs.map(l => ({
      Date: new Date(l.createdAt).toLocaleString('en-IN'),
      Commenter: l.commenterUsername || '',
      Comment: (l.commentText || '').replace(/,/g, ';'),
      Status: l.dmStatus,
      'Skip Reason': l.skipReason || '',
      Error: l.errorMessage || '',
      'Post ID': l.postId || '',
    })), { header: true }).pipe(res);
  } catch (error) { next(error); }
};
