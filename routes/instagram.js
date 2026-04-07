const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instagramController');
const { protect } = require('../middleware/auth');

router.get('/auth-url', protect, ctrl.getAuthUrl);
router.get('/callback', ctrl.handleCallback);
router.get('/account', protect, ctrl.getAccount);
router.get('/posts', protect, ctrl.getPosts);
router.post('/refresh-token', protect, ctrl.refreshToken);
router.delete('/disconnect', protect, ctrl.disconnect);

module.exports = router;
