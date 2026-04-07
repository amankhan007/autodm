/**
 * Instagram token refresher — run weekly
 * Crontab: 0 0 * * 0 node /var/www/instaflow/backend/utils/tokenRefresher.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const connectDB = require('../config/database');
const User = require('../models/User');
const logger = require('./logger');

const GRAPH = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`;

async function refreshExpiringTokens() {
  await connectDB();
  logger.info('Token refresher started (Supabase)');

  // Find all connected users whose token expires within 10 days
  const users = await User.find({ instagramConnected: true });
  const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const expiring = users.filter(u => !u.accessTokenExpiry || new Date(u.accessTokenExpiry) < tenDaysFromNow);

  logger.info(`Found ${expiring.length} users with expiring tokens`);

  for (const user of expiring) {
    try {
      const token = user.getAccessToken();
      if (!token) continue;

      const { data } = await axios.get(`${GRAPH}/refresh_access_token`, {
        params: { grant_type: 'ig_refresh_token', access_token: token }
      });

      const expiry = new Date(Date.now() + data.expires_in * 1000);
      await User.setEncryptedToken(user._id, data.access_token, expiry);

      logger.info(`Token refreshed for @${user.instagramUsername} (${user.email})`);
    } catch (err) {
      logger.error(`Token refresh failed for ${user.email}: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  logger.info('Token refresher done');
  process.exit(0);
}

refreshExpiringTokens().catch(err => { logger.error(err); process.exit(1); });
