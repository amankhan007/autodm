// routes/campaigns.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/campaignController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', ctrl.getCampaigns);
router.post('/', ctrl.createCampaign);
router.get('/:id', ctrl.getCampaign);
router.put('/:id', ctrl.updateCampaign);
router.patch('/:id/status', ctrl.toggleStatus);
router.delete('/:id', ctrl.deleteCampaign);
router.get('/:id/logs', ctrl.getCampaignLogs);

module.exports = router;
