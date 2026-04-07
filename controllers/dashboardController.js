// ── dashboardController.js ───────────────────────────────────────────────────
const Log = require('../models/Log');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

exports.getStats = async (req, res, next) => {
  try {
    const uid = req.user._id;
    const now = new Date();
    const dayStart = new Date(new Date().setHours(0,0,0,0));
    const weekStart = new Date(Date.now() - 7*24*60*60*1000);

    const [totalComments, totalDmsSent, totalDmsFailed, totalSkipped, dmsToday, dmsThisWeek, activeCampaigns, totalCampaigns] = await Promise.all([
      Log.count({ userId: uid }),
      Log.count({ userId: uid, dmStatus: 'success' }),
      Log.count({ userId: uid, dmStatus: 'failed' }),
      Log.count({ userId: uid, dmStatus: 'skipped' }),
      Log.count({ userId: uid, dmStatus: 'success', createdAt: { $gte: dayStart } }),
      Log.count({ userId: uid, dmStatus: 'success', createdAt: { $gte: weekStart } }),
      Campaign.count({ userId: uid, status: 'active' }),
      Campaign.count({ userId: uid }),
    ]);

    const conversionRate = totalComments > 0 ? Math.round((totalDmsSent / totalComments) * 100) : 0;
    const chartData = await getDailyChartData(uid, 7);

    res.json({ success: true, stats: { totalComments, totalDmsSent, totalDmsFailed, totalSkipped, dmsToday, dmsThisWeek, conversionRate, activeCampaigns, totalCampaigns }, chartData });
  } catch (error) { next(error); }
};

exports.getActivity = async (req, res, next) => {
  try {
    const logs = await Log.findRecent(req.user._id, 20);
    res.json({ success: true, logs });
  } catch (error) { next(error); }
};

async function getDailyChartData(userId, days) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dayStart = new Date(d.setHours(0,0,0,0));
    const dayEnd   = new Date(d.setHours(23,59,59,999));
    const [sent, failed, comments] = await Promise.all([
      Log.count({ userId, dmStatus: 'success', createdAt: { $gte: dayStart, $lte: dayEnd } }),
      Log.count({ userId, dmStatus: 'failed',  createdAt: { $gte: dayStart, $lte: dayEnd } }),
      Log.count({ userId,                       createdAt: { $gte: dayStart, $lte: dayEnd } }),
    ]);
    result.push({ date: dayStart.toISOString().split('T')[0], label: dayStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }), sent, failed, comments });
  }
  return result;
}

module.exports.getStats  = exports.getStats;
module.exports.getActivity = exports.getActivity;
