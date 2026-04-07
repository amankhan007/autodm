// routes/dashboard.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
router.use(protect);
router.get('/stats', ctrl.getStats);
router.get('/activity', ctrl.getActivity);
module.exports = router;
