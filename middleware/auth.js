const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer '))
      token = req.headers.authorization.split(' ')[1];
    else if (req.cookies?.token)
      token = req.cookies.token;

    if (!token)
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user)
      return res.status(401).json({ success: false, message: 'User not found.' });
    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Account has been suspended.' });

    User.update(user._id, { lastActive: new Date() }).catch(() => {});
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError')
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    if (error.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    logger.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  next();
};

const requireSubscription = (req, res, next) => {
  if (!req.user.hasActiveSubscription())
    return res.status(403).json({ success: false, message: 'Active subscription required.', code: 'SUBSCRIPTION_REQUIRED' });
  next();
};

const requireInstagram = (req, res, next) => {
  if (!req.user.instagramConnected || !req.user.accessToken)
    return res.status(403).json({ success: false, message: 'Instagram account not connected.', code: 'INSTAGRAM_REQUIRED' });
  next();
};

module.exports = { protect, requireAdmin, requireSubscription, requireInstagram };
