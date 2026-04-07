const axios = require('axios');
const User = require('../models/User');
const logger = require('../utils/logger');
const GRAPH = `https://graph.facebook.com/${process.env.META_API_VERSION || 'v19.0'}`;

exports.getAuthUrl = (req, res) => {
  const scopes = ['instagram_basic','instagram_manage_comments','instagram_manage_messages','pages_show_list','pages_read_engagement','business_management'].join(',');
  const url = `https://www.facebook.com/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(process.env.INSTAGRAM_REDIRECT_URI)}&scope=${scopes}&response_type=code&state=${req.user._id}`;
  res.json({ success: true, url });
};

exports.handleCallback = async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=instagram_auth_failed`);

    const tokenRes = await axios.get(`${GRAPH}/oauth/access_token`, { params: { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: process.env.INSTAGRAM_REDIRECT_URI, code } });
    const llRes = await axios.get(`${GRAPH}/oauth/access_token`, { params: { grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: tokenRes.data.access_token } });
    const { access_token: llToken, expires_in } = llRes.data;

    const pagesRes = await axios.get(`${GRAPH}/me/accounts`, { params: { access_token: llToken } });
    let igId = null, igUsername = null, igPic = null;

    for (const page of pagesRes.data.data || []) {
      try {
        const igRes = await axios.get(`${GRAPH}/${page.id}`, { params: { fields: 'instagram_business_account', access_token: page.access_token } });
        if (igRes.data.instagram_business_account) {
          igId = igRes.data.instagram_business_account.id;
          const det = await axios.get(`${GRAPH}/${igId}`, { params: { fields: 'username,profile_picture_url', access_token: page.access_token } });
          igUsername = det.data.username; igPic = det.data.profile_picture_url;
          break;
        }
      } catch {}
    }

    if (!igId) return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=no_instagram_business`);

    const expiry = new Date(Date.now() + (expires_in || 5183944) * 1000);
    await User.update(state, { instagramAccountId: igId, instagramUsername: igUsername, instagramProfilePicture: igPic, instagramConnected: true, accessTokenExpiry: expiry });
    await User.setEncryptedToken(state, llToken, expiry);

    try { await axios.post(`${GRAPH}/${igId}/subscribed_apps`, null, { params: { subscribed_fields: 'comments,messages', access_token: llToken } }); } catch {}

    logger.info(`Instagram connected for user ${state}: @${igUsername}`);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?success=instagram_connected`);
  } catch (error) {
    logger.error('Instagram OAuth error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=instagram_auth_failed`);
  }
};

exports.getAccount = async (req, res, next) => {
  try {
    if (!req.user.instagramConnected) return res.json({ success: true, connected: false });
    const token = req.user.getAccessToken();
    const { data } = await axios.get(`${GRAPH}/${req.user.instagramAccountId}`, { params: { fields: 'username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website', access_token: token } });
    res.json({ success: true, connected: true, account: data });
  } catch (error) {
    logger.error('Get IG account error:', error.response?.data);
    res.status(500).json({ success: false, message: 'Failed to fetch Instagram account.' });
  }
};

exports.getPosts = async (req, res, next) => {
  try {
    const { limit = 20, after } = req.query;
    const token = req.user.getAccessToken();
    const params = { fields: 'id,media_type,media_url,thumbnail_url,caption,permalink,timestamp,like_count,comments_count', limit: Math.min(parseInt(limit), 50), access_token: token };
    if (after) params.after = after;
    const { data } = await axios.get(`${GRAPH}/${req.user.instagramAccountId}/media`, { params });
    res.json({ success: true, posts: data.data || [], pagination: data.paging || {} });
  } catch (error) {
    logger.error('Get posts error:', error.response?.data);
    res.status(500).json({ success: false, message: 'Failed to fetch posts.' });
  }
};

exports.disconnect = async (req, res, next) => {
  try {
    await User.update(req.user._id, { instagramConnected: false, instagramAccountId: null, instagramUsername: null, instagramProfilePicture: null, accessToken: null, accessTokenExpiry: null });
    res.json({ success: true, message: 'Instagram disconnected.' });
  } catch (error) { next(error); }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const token = req.user.getAccessToken();
    const { data } = await axios.get(`${GRAPH}/refresh_access_token`, { params: { grant_type: 'ig_refresh_token', access_token: token } });
    const expiry = new Date(Date.now() + data.expires_in * 1000);
    await User.setEncryptedToken(req.user._id, data.access_token, expiry);
    res.json({ success: true, message: 'Token refreshed.' });
  } catch (error) {
    logger.error('Token refresh error:', error.response?.data);
    res.status(500).json({ success: false, message: 'Failed to refresh token.' });
  }
};
