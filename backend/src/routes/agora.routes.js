const express = require('express');
const router = express.Router();
const agoraController = require('../controllers/agora.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');

// Rate limiter for token endpoints
const tokenLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute per IP
    message: {
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many token requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @route   POST /api/agora/token
 * @desc    Generate RTC token for audio/video call
 * @access  Private
 * @body    { channelName, uid, role }
 */
router.post('/token', authenticate, tokenLimiter, agoraController.generateToken);

/**
 * @route   POST /api/agora/token/renew
 * @desc    Renew RTC token before expiration
 * @access  Private
 * @body    { channelName, uid }
 */
router.post('/token/renew', authenticate, tokenLimiter, agoraController.renewToken);

/**
 * @route   GET /api/agora/channel/:channelName/status
 * @desc    Get channel status
 * @access  Private
 */
router.get('/channel/:channelName/status', authenticate, agoraController.getChannelStatus);

/**
 * @route   GET /api/agora/config
 * @desc    Get Agora configuration (App ID only)
 * @access  Private
 */
router.get('/config', authenticate, agoraController.getConfig);

/**
 * @route   GET /api/agora/channels/active
 * @desc    Get active channels (Admin only)
 * @access  Private (Admin)
 */
router.get('/channels/active', authenticate, agoraController.getActiveChannels);

module.exports = router;
