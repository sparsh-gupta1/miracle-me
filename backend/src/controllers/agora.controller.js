const agoraService = require('../services/agora.service');
const logger = require('../utils/logger');

class AgoraController {
    /**
     * Generate RTC token for audio/video call
     * POST /api/agora/token
     */
    async generateToken(req, res) {
        try {
            const { channelName, uid, role } = req.body;
            const userId = req.user.id;

            // Validate required fields
            if (!channelName || !uid) {
                return res.status(400).json({
                    success: false,
                    error: 'Channel name and UID are required'
                });
            }

            // Validate user is authorized for this channel
            const isAuthorized = await agoraService.validateChannelAccess(channelName, userId);
            if (!isAuthorized) {
                return res.status(403).json({
                    success: false,
                    error: 'UNAUTHORIZED_CHANNEL',
                    message: 'You are not authorized to join this channel'
                });
            }

            // Ensure UID matches authenticated user
            if (uid !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'UID_MISMATCH',
                    message: 'UID must match your user ID'
                });
            }

            // Generate token
            const tokenData = await agoraService.generateRtcToken(
                channelName,
                uid,
                role || 'PUBLISHER'
            );

            logger.info(`Token generated for user ${userId} in channel ${channelName}`);

            return res.status(200).json({
                success: true,
                ...tokenData
            });
        } catch (error) {
            logger.error('Error in generateToken:', error);
            return res.status(500).json({
                success: false,
                error: 'TOKEN_GENERATION_FAILED',
                message: error.message || 'Failed to generate token'
            });
        }
    }

    /**
     * Renew RTC token before expiration
     * POST /api/agora/token/renew
     */
    async renewToken(req, res) {
        try {
            const { channelName, uid } = req.body;
            const userId = req.user.id;

            // Validate required fields
            if (!channelName || !uid) {
                return res.status(400).json({
                    success: false,
                    error: 'Channel name and UID are required'
                });
            }

            // Validate user is authorized
            const isAuthorized = await agoraService.validateChannelAccess(channelName, userId);
            if (!isAuthorized) {
                return res.status(403).json({
                    success: false,
                    error: 'UNAUTHORIZED_CHANNEL',
                    message: 'You are not authorized to renew token for this channel'
                });
            }

            // Ensure UID matches authenticated user
            if (uid !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'UID_MISMATCH',
                    message: 'UID must match your user ID'
                });
            }

            // Get existing token metadata to preserve role
            const existingToken = await agoraService.getTokenMetadata(channelName, uid);
            const role = existingToken?.role || 'PUBLISHER';

            // Generate new token
            const tokenData = await agoraService.generateRtcToken(
                channelName,
                uid,
                role
            );

            logger.info(`Token renewed for user ${userId} in channel ${channelName}`);

            return res.status(200).json({
                success: true,
                ...tokenData
            });
        } catch (error) {
            logger.error('Error in renewToken:', error);
            return res.status(500).json({
                success: false,
                error: 'TOKEN_RENEWAL_FAILED',
                message: error.message || 'Failed to renew token'
            });
        }
    }

    /**
     * Get channel status (for debugging/monitoring)
     * GET /api/agora/channel/:channelName/status
     */
    async getChannelStatus(req, res) {
        try {
            const { channelName } = req.params;
            const userId = req.user.id;

            // Validate user is authorized
            const isAuthorized = await agoraService.validateChannelAccess(channelName, userId);
            if (!isAuthorized) {
                return res.status(403).json({
                    success: false,
                    error: 'UNAUTHORIZED_CHANNEL',
                    message: 'You are not authorized to view this channel'
                });
            }

            // Get token metadata for this user
            const tokenMetadata = await agoraService.getTokenMetadata(channelName, userId);

            return res.status(200).json({
                success: true,
                channelName,
                userId,
                tokenMetadata: tokenMetadata || null,
                isActive: !!tokenMetadata
            });
        } catch (error) {
            logger.error('Error in getChannelStatus:', error);
            return res.status(500).json({
                success: false,
                error: 'FAILED_TO_GET_STATUS',
                message: error.message || 'Failed to get channel status'
            });
        }
    }

    /**
     * Get Agora configuration (App ID only, never send certificate)
     * GET /api/agora/config
     */
    async getConfig(req, res) {
        try {
            if (!agoraService.isConfigured()) {
                return res.status(503).json({
                    success: false,
                    error: 'AGORA_NOT_CONFIGURED',
                    message: 'Agora is not configured on the server'
                });
            }

            res.set('Cache-Control', 'no-store');
            return res.status(200).json({
                success: true,
                appId: agoraService.appId,
                tokenExpiration: agoraService.tokenExpiration
            });
        } catch (error) {
            logger.error('Error in getConfig:', error);
            return res.status(500).json({
                success: false,
                error: 'FAILED_TO_GET_CONFIG',
                message: error.message || 'Failed to get configuration'
            });
        }
    }

    /**
     * Get active channels (Admin only)
     * GET /api/agora/channels/active
     */
    async getActiveChannels(req, res) {
        try {
            // Check if user is admin
            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'ADMIN_ONLY',
                    message: 'This endpoint is for admins only'
                });
            }

            const channels = await agoraService.getActiveChannels();

            return res.status(200).json({
                success: true,
                channels,
                count: channels.length
            });
        } catch (error) {
            logger.error('Error in getActiveChannels:', error);
            return res.status(500).json({
                success: false,
                error: 'FAILED_TO_GET_CHANNELS',
                message: error.message || 'Failed to get active channels'
            });
        }
    }
}

module.exports = new AgoraController();
