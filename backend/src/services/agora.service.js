const crypto = require('crypto');
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder, RtmRole } = require('agora-access-token');
const logger = require('../utils/logger');
const redisService = require('./redis.service');

class AgoraService {
    constructor() {
        this.appId = process.env.AGORA_APP_ID;
        this.appCertificate = process.env.AGORA_APP_CERTIFICATE;
        this.tokenExpiration = parseInt(process.env.AGORA_TOKEN_EXPIRATION) || 3600;
        this.privilegeExpiration = parseInt(process.env.AGORA_PRIVILEGE_EXPIRATION) || 3600;
        // Secret configured in the Agora console for Notification Center Service (NCS)
        this.ncsSecret = process.env.AGORA_NCS_SECRET;

        // Validate configuration on startup
        if (!this.appId || this.appId === 'your_agora_app_id_here') {
            logger.warn('Agora App ID not configured. Token generation will fail.');
        }
        if (!this.appCertificate || this.appCertificate === 'your_agora_app_certificate_here') {
            logger.warn('Agora App Certificate not configured. Token generation will fail.');
        }
    }

    /**
     * Validate Agora configuration
     * @returns {boolean}
     */
    isConfigured() {
        return (
            this.appId &&
            this.appId !== 'your_agora_app_id_here' &&
            this.appCertificate &&
            this.appCertificate !== 'your_agora_app_certificate_here'
        );
    }

    /**
     * Generate RTC token for audio/video calls
     * @param {string} channelName - Channel name (use conversation ID)
     * @param {string} uid - User ID (string or number)
     * @param {string} role - 'PUBLISHER' or 'SUBSCRIBER'
     * @param {number} expirationTime - Token expiration in seconds (optional)
     * @returns {Promise<object>}
     */
    async generateRtcToken(channelName, uid, role = 'PUBLISHER', expirationTime = null) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Agora is not configured. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env');
            }

            // Validate inputs
            if (!channelName || !uid) {
                throw new Error('Channel name and UID are required');
            }

            // Determine role
            const agoraRole = role === 'PUBLISHER' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

            // Calculate expiration times
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const tokenExpirationTime = expirationTime || this.tokenExpiration;
            const privilegeExpirationTime = expirationTime || this.privilegeExpiration;

            const tokenExpireTimestamp = currentTimestamp + tokenExpirationTime;
            const privilegeExpireTimestamp = currentTimestamp + privilegeExpirationTime;

            // Generate token (using buildTokenWithAccount because UID is a string UUID)
            const token = RtcTokenBuilder.buildTokenWithAccount(
                this.appId,
                this.appCertificate,
                channelName,
                uid.toString(),
                agoraRole,
                privilegeExpireTimestamp
            );

            const expiresAt = new Date(tokenExpireTimestamp * 1000).toISOString();

            // Store token metadata in Redis for tracking
            await redisService.client.hSet(`agora-token:${channelName}:${uid}`, {
                token,
                channelName,
                uid: uid.toString(),
                role,
                createdAt: new Date().toISOString(),
                expiresAt,
                expiresIn: tokenExpirationTime
            });

            // Set expiration on Redis key
            await redisService.client.expire(
                `agora-token:${channelName}:${uid}`,
                tokenExpirationTime + 300 // Keep for 5 minutes after expiration for debugging
            );

            logger.info(`Generated Agora RTC token for channel: ${channelName}, uid: ${uid}, role: ${role}`);

            return {
                token,
                channelName,
                uid,
                appId: this.appId,
                role,
                expiresAt,
                expiresIn: tokenExpirationTime
            };
        } catch (error) {
            logger.error('Error generating Agora RTC token:', error);
            throw error;
        }
    }

    /**
     * Generate RTM token for real-time messaging (optional)
     * @param {string} userId - User ID
     * @param {number} expirationTime - Token expiration in seconds (optional)
     * @returns {Promise<object>}
     */
    async generateRtmToken(userId, expirationTime = null) {
        try {
            if (!this.isConfigured()) {
                throw new Error('Agora is not configured');
            }

            if (!userId) {
                throw new Error('User ID is required');
            }

            const currentTimestamp = Math.floor(Date.now() / 1000);
            const tokenExpirationTime = expirationTime || this.tokenExpiration;
            const privilegeExpireTimestamp = currentTimestamp + tokenExpirationTime;

            const token = RtmTokenBuilder.buildToken(
                this.appId,
                this.appCertificate,
                userId,
                RtmRole.Rtm_User,
                privilegeExpireTimestamp
            );

            const expiresAt = new Date(privilegeExpireTimestamp * 1000).toISOString();

            logger.info(`Generated Agora RTM token for user: ${userId}`);

            return {
                token,
                userId,
                appId: this.appId,
                expiresAt,
                expiresIn: tokenExpirationTime
            };
        } catch (error) {
            logger.error('Error generating Agora RTM token:', error);
            throw error;
        }
    }

    /**
     * Validate if user is authorized to join a channel
     * @param {string} channelName - Channel name (conversation ID)
     * @param {string} userId - User ID
     * @returns {Promise<boolean>}
     */
    async validateChannelAccess(channelName, userId) {
        try {
            // Check if channel exists in Redis (created during call request)
            const callData = await redisService.client.hGetAll(`call:${channelName}`);

            if (!callData || !callData.conversationId) {
                logger.warn(`Agora authorization failed: Channel ${channelName} not found in Redis (Key: call:${channelName})`);
                return false;
            }

            // Check if user is a participant
            const isParticipant =
                callData.senderId === userId || callData.receiverId === userId;

            if (!isParticipant) {
                logger.warn(`User ${userId} is not authorized for channel ${channelName}`);
                return false;
            }

            return true;
        } catch (error) {
            logger.error('Error validating channel access:', error);
            return false;
        }
    }

    /**
     * Get token metadata from Redis
     * @param {string} channelName - Channel name
     * @param {string} uid - User ID
     * @returns {Promise<object|null>}
     */
    async getTokenMetadata(channelName, uid) {
        try {
            const metadata = await redisService.client.hGetAll(`agora-token:${channelName}:${uid}`);

            if (!metadata || !metadata.token) {
                return null;
            }

            return metadata;
        } catch (error) {
            logger.error('Error getting token metadata:', error);
            return null;
        }
    }

    /**
     * Cleanup channel data when call ends
     * @param {string} channelName - Channel name
     */
    async cleanupChannel(channelName) {
        try {
            // Get all token keys for this channel
            const keys = await redisService.client.keys(`agora-token:${channelName}:*`);

            if (keys.length > 0) {
                await redisService.client.del(keys);
                logger.info(`Cleaned up ${keys.length} Agora tokens for channel ${channelName}`);
            }
        } catch (error) {
            logger.error('Error cleaning up Agora channel:', error);
        }
    }

    /**
     * Get active channels (for monitoring)
     * @returns {Promise<Array>}
     */
    async getActiveChannels() {
        try {
            const keys = await redisService.client.keys('agora-token:*');
            const channels = new Set();

            for (const key of keys) {
                const parts = key.split(':');
                if (parts.length >= 2) {
                    channels.add(parts[1]); // Channel name
                }
            }

            return Array.from(channels);
        } catch (error) {
            logger.error('Error getting active channels:', error);
            return [];
        }
    }

    /**
     * Verify an Agora NCS (Notification Center Service) webhook signature.
     * NCS signs the raw request body with the project's secret:
     *   Agora-Signature-V2 = HMAC-SHA256(secret, rawBody)   (hex)
     *   Agora-Signature     = HMAC-SHA1(secret, rawBody)     (hex, legacy)
     *
     * @param {string} rawBody - The raw request body string (req.rawBody)
     * @param {object} headers - Lowercased request headers
     * @returns {boolean} true if a provided signature matches
     */
    verifyNcsSignature(rawBody, headers = {}) {
        try {
            if (!this.ncsSecret) {
                logger.warn('AGORA_NCS_SECRET not configured — rejecting webhook');
                return false;
            }
            if (rawBody == null) return false;

            const sigV2 = headers['agora-signature-v2'];
            const sigV1 = headers['agora-signature'];

            const matches = (provided, algo) => {
                if (!provided) return false;
                const expected = crypto.createHmac(algo, this.ncsSecret).update(rawBody).digest('hex');
                // Constant-time compare; lengths must match for timingSafeEqual
                if (expected.length !== provided.length) return false;
                return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
            };

            return matches(sigV2, 'sha256') || matches(sigV1, 'sha1');
        } catch (error) {
            logger.error('Error verifying Agora NCS signature:', error);
            return false;
        }
    }

    /**
     * Generate tokens for both participants in a call
     * @param {string} channelName - Channel name (conversation ID)
     * @param {string} callerId - Caller user ID
     * @param {string} receiverId - Receiver user ID
     * @returns {Promise<object>}
     */
    async generateCallTokens(channelName, callerId, receiverId) {
        try {
            const [callerToken, receiverToken] = await Promise.all([
                this.generateRtcToken(channelName, callerId, 'PUBLISHER'),
                this.generateRtcToken(channelName, receiverId, 'PUBLISHER')
            ]);

            logger.info(`Generated tokens for call ${channelName}`);

            return {
                caller: callerToken,
                receiver: receiverToken,
                channelName,
                appId: this.appId
            };
        } catch (error) {
            logger.error('Error generating call tokens:', error);
            throw error;
        }
    }
}

module.exports = new AgoraService();
