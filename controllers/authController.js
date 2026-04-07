const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);
  res.cookie('token', token, {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
  });
  const safe = { ...user };
  delete safe.password; delete safe.accessToken; delete safe.otpCode;
  delete safe.hasActiveSubscription; delete safe.getAccessToken;
  res.status(statusCode).json({ success: true, token, user: safe });
};

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      name, email, password,
      emailVerificationToken: crypto.createHash('sha256').update(verificationToken).digest('hex'),
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    try { await emailService.sendVerificationEmail(user.email, user.name, verificationToken); } catch {}
    sendTokenResponse(user, 201, res);
  } catch (error) { next(error); }
};

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { email, password } = req.body;
    const raw = await User.findRawByEmail(email);
    if (!raw || !(await User.comparePassword(password, raw.password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (!raw.is_active)
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
    await User.update(raw.id, { lastLogin: new Date() });
    const user = await User.findById(raw.id);
    logger.info(`Login: ${user.email}`);
    sendTokenResponse(user, 200, res);
  } catch (error) { next(error); }
};

exports.logout = (req, res) => {
  res.cookie('token', '', { expires: new Date(0), httpOnly: true });
  res.json({ success: true, message: 'Logged out.' });
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const safe = { ...user }; delete safe.hasActiveSubscription; delete safe.getAccessToken;
    res.json({ success: true, user: safe });
  } catch (error) { next(error); }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If that email exists, an OTP has been sent.' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await User.update(user._id, {
      otpCode: crypto.createHash('sha256').update(otp).digest('hex'),
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
    });
    await emailService.sendOTPEmail(user.email, user.name, otp);
    res.json({ success: true, message: 'OTP sent to your email.' });
  } catch (error) { next(error); }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const user = await User.findOne({ email, otpCode: hashedOtp, otpExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    await User.update(user._id, {
      passwordResetToken: crypto.createHash('sha256').update(resetToken).digest('hex'),
      passwordResetExpires: new Date(Date.now() + 15 * 60 * 1000),
      otpCode: null, otpExpires: null,
    });
    res.json({ success: true, resetToken });
  } catch (error) { next(error); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { resetToken, password } = req.body;
    const hashed = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({ passwordResetToken: hashed, passwordResetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    await User.updatePassword(user._id, password);
    const fresh = await User.findById(user._id);
    sendTokenResponse(fresh, 200, res);
  } catch (error) { next(error); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, emailNotifications, timezone } = req.body;
    await User.update(req.user._id, { name, emailNotifications, timezone });
    const user = await User.findById(req.user._id);
    const safe = { ...user }; delete safe.hasActiveSubscription; delete safe.getAccessToken;
    res.json({ success: true, user: safe });
  } catch (error) { next(error); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const raw = await User.findRawByEmail(req.user.email);
    if (!raw || !(await User.comparePassword(currentPassword, raw.password)))
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    await User.updatePassword(req.user._id, newPassword);
    const user = await User.findById(req.user._id);
    sendTokenResponse(user, 200, res);
  } catch (error) { next(error); }
};
