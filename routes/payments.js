// routes/payments.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/create-subscription', ctrl.createSubscription);
router.post('/verify', ctrl.verifyPayment);
router.get('/history', ctrl.getPaymentHistory);
router.post('/cancel', ctrl.cancelSubscription);

module.exports = router;
