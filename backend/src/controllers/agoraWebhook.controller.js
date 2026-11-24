const logger = require("../utils/logger");
const agoraService = require("../services/agora.service");
const redisService = require("../services/redis.service");
const callLifecycle = require("../services/callLifecycle.service");

// Agora NCS RTC channel-event types (productId 1)
const EVENT = {
    CHANNEL_CREATE: 101,
    CHANNEL_DESTROY: 102,
    BROADCASTER_JOIN: 103,
    BROADCASTER_LEAVE: 104,
    AUDIENCE_JOIN: 105,
    AUDIENCE_LEAVE: 106,
};

// NCS 104 payload.reason: 1 = the user quit the channel normally. Everything else
// (2 timeout, 10 network, 999 abnormal, ...) is a drop the user may come back from.
const LEAVE_REASON_QUIT = 1;

/**
 * Agora Notification Center Service (NCS) webhook.
 *
 * This is the AUTHORITATIVE source for "both participants are in the channel"
 * (start billing) and "the channel is gone / a participant left" (stop billing),
 * replacing reliance on the frontend's call-connected / call-end socket events.
 *
 * Configure in the Agora console: enable NCS for the project, point the callback
 * at POST /api/agora/webhook, and copy the signing secret into AGORA_NCS_SECRET.
 */
class AgoraWebhookController {
    /**
     * POST /api/agora/webhook  (no auth middleware — Agora calls this)
     */
    async handle(req, res) {
        // 1. Verify signature against the raw body (captured globally in app.js)
        const headers = req.headers || {};
        const isValid = agoraService.verifyNcsSignature(req.rawBody, headers);
        if (!isValid) {
            logger.warn("Agora webhook: invalid or missing signature");
            return res.status(401).json({ success: false, message: "Invalid signature" });
        }

        // 2. Acknowledge immediately so Agora doesn't retry; process async.
        res.status(200).json({ success: true });

        try {
            const body = req.body || {};
            const eventType = body.eventType;
            const payload = body.payload || {};
            const channelName = payload.channelName;

            if (!channelName || eventType == null) {
                logger.info("Agora webhook: ignoring payload without channelName/eventType");
                return;
            }

            // Resolve our call from the channel name (= conversationId).
            const mirror = await redisService.client.hGetAll(`call:${channelName}`);
            const request_id = mirror && mirror.requestId;
            if (!request_id) {
                logger.info(`Agora webhook: no active call for channel ${channelName} (event ${eventType}) — ignoring`);
                return;
            }

            const senderId = mirror.senderId;
            const receiverId = mirror.receiverId;
            // For string user accounts NCS sends `account`; otherwise a numeric `uid`.
            const identity = payload.account != null ? payload.account.toString()
                : (payload.uid != null ? payload.uid.toString() : null);

            switch (eventType) {
                case EVENT.BROADCASTER_JOIN:
                    await this._handleJoin(request_id, channelName, identity, senderId, receiverId);
                    break;

                case EVENT.BROADCASTER_LEAVE:
                    // A participant left: hung up on purpose → end for both; dropped → grace window.
                    await this._handleLeave(request_id, identity, senderId, receiverId, payload.reason);
                    break;

                case EVENT.CHANNEL_DESTROY:
                    // Channel gone (everyone left) → definitive end of the call.
                    logger.info(`Agora webhook: channel ${channelName} destroyed — ending call ${request_id}`);
                    await callLifecycle.endCall(request_id, null, "agora_channel_destroyed");
                    await redisService.client.del(`call:${request_id}:agora_joined`);
                    break;

                default:
                    // 101 (create), 105/106 (audience) — not relevant to 1:1 billing.
                    logger.debug(`Agora webhook: unhandled event ${eventType} for channel ${channelName}`);
            }
        } catch (error) {
            logger.error("Error processing Agora webhook:", error);
        }
    }

    /**
     * Broadcaster joined. Mark presence. When two distinct broadcasters are in the
     * channel we know both our participants are present → start billing. We also
     * map the joining identity to one of our users when possible (string accounts),
     * which keeps the reconnect/resume path working.
     * @private
     */
    async _handleJoin(request_id, channelName, identity, senderId, receiverId) {
        // If the joining identity maps to one of our users, signal that user directly
        // (handles reconnect-resume and the normal first join).
        if (identity && (identity === senderId || identity === receiverId)) {
            await callLifecycle.markConnected(request_id, identity);
        }

        // Count distinct broadcasters seen on the channel. A 1:1 call has exactly two,
        // so >= 2 means both participants are present regardless of id mapping.
        const joinedKey = `call:${request_id}:agora_joined`;
        if (identity) {
            await redisService.client.sAdd(joinedKey, identity);
            await redisService.client.expire(joinedKey, 3600);
        }
        const distinct = await redisService.client.sCard(joinedKey);

        if (distinct >= 2) {
            // Guarantee billing starts: marking both makes the connected set complete.
            // markConnected is idempotent, so this is safe even if already started.
            await callLifecycle.markConnected(request_id, senderId);
            await callLifecycle.markConnected(request_id, receiverId);
        }
    }

    /**
     * A broadcaster left but the channel still exists. A normal quit (NCS reason 1)
     * means they hung up: end the call for both so the other side isn't left in the
     * room waiting. Any other reason is a drop (timeout, network, ...): open a
     * reconnect grace window instead. Only when we can map the identity;
     * channel-destroy (102) is the definitive end, so an unmappable leave is ignored.
     * @private
     */
    async _handleLeave(request_id, identity, senderId, receiverId, leaveReason) {
        const joinedKey = `call:${request_id}:agora_joined`;
        if (identity) await redisService.client.sRem(joinedKey, identity);

        if (identity && (identity === senderId || identity === receiverId)) {
            if (Number(leaveReason) === LEAVE_REASON_QUIT) {
                logger.info(`Agora webhook: ${identity} quit call ${request_id} — ending it for both`);
                await callLifecycle.endCallForAll(request_id, identity, "peer_left");
                return;
            }
            await callLifecycle.markDisconnected(request_id, identity, "agora_left");
        } else {
            logger.info(`Agora webhook: broadcaster left channel for call ${request_id} (identity unmapped) — deferring to channel-destroy/grace`);
        }
    }
}

module.exports = new AgoraWebhookController();
