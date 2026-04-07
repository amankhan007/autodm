const express = require('express');
const router = express.Router();
const webhookCtrl = require('../controllers/webhookController');
const paymentCtrl = require('../controllers/paymentController');

// Meta Instagram webhook
router.get('/', webhookCtrl.verify);
router.post('/', webhookCtrl.handleEvent);

// Razorpay webhook
router.post('/razorpay', paymentCtrl.razorpayWebhook);

module.exports = router;
