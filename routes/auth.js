// routes/auth.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register',
  [body('name').trim().notEmpty(), body('email').isEmail(), body('password').isLength({ min: 8 })],
  ctrl.register
);
router.post('/login',
  [body('email').isEmail(), body('password').notEmpty()],
  ctrl.login
);
router.post('/logout', ctrl.logout);
router.get('/me', protect, ctrl.getMe);
router.post('/forgot-password', [body('email').isEmail()], ctrl.forgotPassword);
router.post('/verify-otp', [body('email').isEmail(), body('otp').isLength({ min: 6, max: 6 })], ctrl.verifyOTP);
router.post('/reset-password', ctrl.resetPassword);
router.put('/update-profile', protect, ctrl.updateProfile);
router.put('/change-password', protect, ctrl.changePassword);

module.exports = router;
