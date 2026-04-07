const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/logsController');
const { protect } = require('../middleware/auth');
router.use(protect);
router.get('/', ctrl.getLogs);
router.get('/export', ctrl.exportLogs);
module.exports = router;
