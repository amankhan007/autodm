const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const Payment = require('../models/Payment');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.createSubscription = async (req, res, next) => {
  try {
    if (req.user.hasActiveSubscription())
      return res.status(400).json({ success: false, message: 'Already have an active subscription.' });

    const subscription = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_PLAN_ID,
      customer_notify: 1,
      quantity: 1,
      total_count: 12,
      notes: { userId: req.user._id.toString(), email: req.user.email },
    });

    await User.update(req.user._id, { subscriptionId: subscription.id });
    res.json({ success: true, subscriptionId: subscription.id, key: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    logger.error('Create subscription error:', error);
    next(error);
  }
};

exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest('hex');

    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, message: 'Invalid payment signature.' });

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await Payment.create({
      userId: req.user._id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySubscriptionId: razorpay_subscription_id,
      razorpaySignature: razorpay_signature,
      amount: payment.amount,
      currency: payment.currency,
      status: 'captured',
      plan: 'monthly',
      planAmount: parseInt(process.env.SUBSCRIPTION_PRICE || '199') * 100,
      periodStart: now,
      periodEnd,
    });

    await User.update(req.user._id, {
      subscriptionStatus: 'active',
      subscriptionId: razorpay_subscription_id,
      subscriptionStart: now,
      subscriptionEnd: periodEnd,
    });

    try {
      await emailService.sendPaymentConfirmation(req.user.email, req.user.name, {
        amount: payment.amount / 100,
        currency: payment.currency,
        periodEnd,
      });
    } catch (e) { logger.error('Payment email error:', e); }

    logger.info(`Payment verified for ${req.user._id}: ₹${payment.amount / 100}`);
    res.json({ success: true, message: 'Payment verified. Subscription activated!' });
  } catch (error) { next(error); }
};

exports.razorpayWebhook = async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const body = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    const sig = req.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
    if (sig !== expected) { logger.warn('Razorpay webhook signature mismatch'); return; }

    const event = JSON.parse(body);
    logger.info(`Razorpay webhook: ${event.event}`);

    switch (event.event) {
      case 'subscription.charged': {
        const sub = event.payload.subscription.entity;
        const pay = event.payload.payment.entity;
        const userId = sub.notes?.userId;
        if (!userId) break;
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await Payment.create({ userId, razorpayPaymentId: pay.id, razorpaySubscriptionId: sub.id, amount: pay.amount, currency: pay.currency, status: 'captured', plan: 'monthly', periodStart: now, periodEnd });
        await User.update(userId, { subscriptionStatus: 'active', subscriptionEnd: periodEnd });
        break;
      }
      case 'subscription.cancelled':
      case 'subscription.expired': {
        const userId = event.payload.subscription.entity.notes?.userId;
        if (userId) await User.update(userId, { subscriptionStatus: 'expired' });
        break;
      }
    }
  } catch (error) { logger.error('Razorpay webhook error:', error); }
};

exports.getPaymentHistory = async (req, res, next) => {
  try {
    const payments = await Payment.findByUser(req.user._id);
    res.json({ success: true, payments });
  } catch (error) { next(error); }
};

exports.cancelSubscription = async (req, res, next) => {
  try {
    if (!req.user.subscriptionId)
      return res.status(400).json({ success: false, message: 'No active subscription to cancel.' });
    await razorpay.subscriptions.cancel(req.user.subscriptionId, { cancel_at_cycle_end: 1 });
    await User.update(req.user._id, { subscriptionStatus: 'cancelled' });
    res.json({ success: true, message: 'Subscription will be cancelled at end of billing cycle.' });
  } catch (error) { next(error); }
};
