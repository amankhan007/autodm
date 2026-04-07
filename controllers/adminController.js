const User = require('../models/User');
const Campaign = require('../models/Campaign');
const Log = require('../models/Log');
const Payment = require('../models/Payment');

exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const { users, total } = await User.findAdmin({ search, status, limit: parseInt(limit), offset: (parseInt(page)-1)*parseInt(limit) });
    res.json({ success: true, users, total, page: parseInt(page) });
  } catch (error) { next(error); }
};

exports.getStats = async (req, res, next) => {
  try {
    const dayStart = new Date(new Date().setHours(0,0,0,0));
    const [totalUsers, activeSubscribers, totalDmsSent, totalRevenue, newUsersToday] = await Promise.all([
      User.count(),
      User.count({ subscriptionStatus: 'active' }),
      Log.count({ dmStatus: 'success' }),
      Payment.totalRevenue(),
      User.count({ createdAt: { $gte: dayStart } }),
    ]);
    res.json({ success: true, stats: { totalUsers, activeSubscribers, totalDmsSent, totalRevenue: totalRevenue / 100, newUsersToday } });
  } catch (error) { next(error); }
};

exports.toggleUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    await User.update(req.params.id, { isActive: !user.isActive });
    res.json({ success: true, message: `User ${!user.isActive ? 'activated' : 'suspended'}.`, isActive: !user.isActive });
  } catch (error) { next(error); }
};

exports.updateSubscription = async (req, res, next) => {
  try {
    const { status, daysToAdd } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const updates = { subscriptionStatus: status };
    if (daysToAdd) {
      const base = user.subscriptionEnd && new Date(user.subscriptionEnd) > new Date() ? new Date(user.subscriptionEnd) : new Date();
      updates.subscriptionEnd = new Date(base.getTime() + parseInt(daysToAdd) * 86400000);
      if (!user.subscriptionStart) updates.subscriptionStart = new Date();
    }
    await User.update(req.params.id, updates);
    res.json({ success: true, message: 'Subscription updated.' });
  } catch (error) { next(error); }
};
