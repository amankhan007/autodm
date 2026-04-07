/**
 * Daily email report — run at 8am
 * Crontab: 0 8 * * * node /var/www/instaflow/backend/utils/dailyReport.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const connectDB = require('../config/database');
const User = require('../models/User');
const Log = require('../models/Log');
const emailService = require('../services/emailService');
const logger = require('./logger');

async function sendDailyReports() {
  await connectDB();
  logger.info('Daily report job started (Supabase)');

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const users = await User.find({ emailNotifications: true, instagramConnected: true });

  for (const user of users) {
    try {
      const [comments, sent, failed] = await Promise.all([
        Log.count({ userId: user._id, createdAt: { $gte: yesterday } }),
        Log.count({ userId: user._id, dmStatus: 'success', createdAt: { $gte: yesterday } }),
        Log.count({ userId: user._id, dmStatus: 'failed',  createdAt: { $gte: yesterday } }),
      ]);

      if (comments === 0) continue;

      await emailService.sendDmAlertEmail(user.email, user.name, {
        comments, sent, failed,
        rate: comments > 0 ? Math.round((sent / comments) * 100) : 0,
      });

      logger.info(`Daily report → ${user.email}`);
    } catch (err) {
      logger.error(`Report failed for ${user.email}: ${err.message}`);
    }
  }

  logger.info('Daily report job done');
  process.exit(0);
}

sendDailyReports().catch(err => { logger.error(err); process.exit(1); });
