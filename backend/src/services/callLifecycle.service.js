const logger = require("../utils/logger");
const redisService = require("./redis.service");
const callDurationMonitor = require("./callDurationMonitor.service");

// Grace period (seconds) a participant has to reconnect before the call is terminated
const RECONNECT_GRACE_SECONDS = 30;
// The reconnect marker must outlive the grace timer: the timer decides by reading it, so a
// TTL equal to the grace window lets it expire first and the call is never ended.
const RECONNECT_KEY_TTL_SECONDS = RECONNECT_GRACE_SECONDS + 30;
const CALL_END_REASON_MAP = {
    user_ended: "manual",
    // The other side quit the Agora channel on purpose (NCS 104 reason 1), not a drop.
    peer_left: "manual",
    reconnect_timeout: "disconnect",
    disconnect_before_join: "disconnect",
    zero_balance_at_connect: "balance_exhausted",
    inactivity_timeout: "inactivity",
    affordable_duration_exhausted: "call_duration_limit",
};

/**
 * Shared call lifecycle logic for billing start/stop.
 *
 * This module is the single source of truth for "a participant joined", "a
 * participant left/disconnected" and "the call ended". Both the socket handlers
 * (callRequest.handler.js — frontend fast-path) and the Agora NCS webhook
 * (agoraWebhook.controller.js — authoritative) delegate here, so billing
 * behaves identically regardless of what triggered the event. All methods are
 * idempotent so a duplicate signal (e.g. socket call-connected AND webhook 103)
 * cannot double-bill.
 *
 * Because the webhook is not a socket, this module obtains the Socket.IO
 * instance lazily via getIO() instead of having it passed in.
 */
class CallLifecycleService {
    _billingStartLockKey(requestId) {
        return `call:${requestId}:billing_start_lock`;
    }

    /**
     * Resolve the Socket.IO instance, or null if it isn't initialized yet
     * (e.g. in unit tests). Callers must tolerate a null io.
     * @returns {object|null}
     */
    _io() {
        try {
            // Lazy require to avoid a load-time dependency on the websocket config
            const { getIO } = require("../config/websocket");
            return getIO();
        } catch (err) {
            return null;
        }
    }

    /**
     * Mark a participant as connected to the Agora channel.
     *
     * - First-time join: adds the user to the connected set and, once BOTH
     *   participants are present, starts the conversation + billing monitor.
     * - Reconnect (within the grace window): resumes the paused billing monitor.
     *
     * Idempotent: a second call for an already-started call is a no-op.
     *
     * @param {string} request_id - Call request ID
     * @param {string} joiningUserId - User ID that just joined
     * @param {object} [opts]
     * @param {string} [opts.socketId] - Socket ID to refresh on reconnect (socket path only)
     * @returns {Promise<{reconnected: boolean, started?: boolean}>}
     */
    async markConnected(request_id, joiningUserId, opts = {}) {
        try {
            const { socketId } = opts;
            const uid = joiningUserId.toString();

            const callData = await redisService.client.hGetAll(`call:${request_id}`);
            if (!callData || !callData.conversationId) {
                logger.warn(`markConnected: call ${request_id} not found or expired`);
                return { reconnected: false };
            }

            // ── Reconnect path: call was paused due to a disconnect ──────────────
            const reconnectKey = `call:${request_id}:reconnect`;
            // The marker is "<disconnectedUserId>|<token>". Only the user who dropped may
            // clear it; the other participant joining again must not resume billing.
            const reconnectMarker = await redisService.client.get(reconnectKey);
            const isReconnect = !!reconnectMarker && String(reconnectMarker).split("|")[0] === uid;
            if (isReconnect) {
                logger.info(`Call ${request_id}: user ${uid} reconnected within grace period`);
                await redisService.client.del(reconnectKey);

                // Refresh the reconnected user's socket id (socket path only)
                if (socketId) {
                    if (callData.senderId === uid) {
                        await redisService.client.hSet(`call:${request_id}`, { callerSocketId: socketId });
                    } else {
                        await redisService.client.hSet(`call:${request_id}`, { receiverSocketId: socketId });
                    }
                }

                const io = this._io();
                await callDurationMonitor.resumeMonitoring(request_id, io);
                await callDurationMonitor.recordActivity(request_id);

                const otherUserId = callData.senderId === uid ? callData.receiverId : callData.senderId;
                if (io) {
                    io.to(`user:${otherUserId}`).emit("call-participant-reconnected", {
                        request_id,
                        userId: joiningUserId,
                        message: "Participant has reconnected",
                    });
                }
                return { reconnected: true };
            }

            // ── First-time join: try to start billing when both are present ─────
            const connKey = `call:${request_id}:connected`;
            await redisService.client.sAdd(connKey, uid);
            await redisService.client.expire(connKey, 3600); // TTL safety

            const connectedUsers = await redisService.client.sMembers(connKey);
            const { conversationId, senderId, receiverId, payerId, earnerId, serviceType, balanceInfo } = callData;
            const actualPayerId = payerId || senderId;

            if (uid !== senderId.toString() && uid !== receiverId.toString()) {
                logger.warn(`markConnected: user ${uid} is not a participant in call ${request_id}`);
                return { reconnected: false, started: false };
            }

            const bothConnected =
                connectedUsers.includes(senderId.toString()) &&
                connectedUsers.includes(receiverId.toString());

            if (!bothConnected) {
                logger.info(`Call ${request_id}: waiting for both users. Connected so far: [${connectedUsers.join(",")}]`);
                return { reconnected: false, started: false };
            }

            // Both are in — cancel the join timeout if still pending
            const joinTimeoutKey = `call:${request_id}:join_timeout`;
            await redisService.client.del(joinTimeoutKey);

            // Idempotent guard — billing already started
            if (callData.status === "started") {
                logger.info(`Call ${request_id}: billing already started, skipping duplicate start`);
                // A reconnect after the marker is gone must still un-pause the monitor,
                // otherwise the balance cap stays disabled for the rest of the call.
                const monitorStatus = await redisService.client.hGet(`call-monitor:${request_id}`, "status");
                if (monitorStatus === "paused" && !reconnectMarker) {
                    await callDurationMonitor.resumeMonitoring(request_id, this._io());
                }
                return { reconnected: false, started: true };
            }

            const startLockKey = this._billingStartLockKey(request_id);
            const lockToken = `${process.pid}:${Date.now()}:${Math.random()}`;
            const lockAcquired = await redisService.client.set(
                startLockKey,
                lockToken,
                { NX: true, EX: 30 }
            );
            if (!lockAcquired) {
                logger.info(`Call ${request_id}: billing start already in progress, skipping duplicate start`);
                return { reconnected: false, started: true };
            }

            try {
                logger.info(`Call ${request_id}: both participants connected — starting billing now`);

                const parsedBalance = JSON.parse(balanceInfo || "null");
                const conversationService = require("./conversation.service");

                const startResult = await conversationService.startConversation(
                    conversationId,
                    true,
                    actualPayerId,
                    serviceType,
                    this._io()
                );

                const { balanceInfo: updatedBalance } = startResult;

                await Promise.all([
                    redisService.client.hSet(`call:${request_id}`, { status: "started", startedAt: new Date().toISOString() }),
                    redisService.client.hSet(`call:${conversationId}`, { status: "started", startedAt: new Date().toISOString() }),
                ]);

                // Prefer the freshly computed affordableSeconds from startConversation (re-reads
                // wallet live) over the stale value stored in Redis at call-request time.
                const affordableSeconds = updatedBalance?.affordableSeconds
                    ?? parsedBalance?.affordableSeconds
                    ?? 0;

                const io = this._io();

                // Guard: if the balance drained to zero between the call request and Agora connect,
                // end the call immediately rather than starting a monitor with 0 duration.
                if (affordableSeconds <= 0) {
                    logger.warn(`Call ${request_id}: affordableSeconds=0 at connect time, ending call immediately (balance exhausted).`);
                    await this.endCall(request_id, callData, "zero_balance_at_connect");
                    if (io) {
                        // The payer is the one who must recharge — not the caller, which is
                        // the listener when a listener starts the call.
                        io.to(`user:${actualPayerId}`).emit("wallet:recharge_required", {
                            reason: "balance_exhausted",
                            balanceAfter: updatedBalance?.balance ?? 0,
                            freeSecondsRemaining: updatedBalance?.freeSecondsRemaining ?? 0,
                            serviceType,
                            message: "Your wallet balance is \u20b90. The call cannot start. Recharge to make calls.",
                        });
                        io.to(`user:${senderId}`).emit("call-ended", { request_id, reason: "balance_exhausted" });
                        io.to(`user:${receiverId}`).emit("call-ended", { request_id, reason: "balance_exhausted" });
                    }
                    return { reconnected: false, started: false };
                }

                if (affordableSeconds > 0) {
                    await callDurationMonitor.startMonitoring(
                        request_id,
                        conversationId,
                        senderId,
                        receiverId,
                        affordableSeconds,
                        io,
                        serviceType,
                        actualPayerId,
                        earnerId || receiverId
                    );
                }

                const billingPayload = {
                    request_id,
                    conversationId,
                    message: "Billing started — both participants are connected",
                    balanceInfo: parsedBalance || updatedBalance,
                };
                if (io) {
                    io.to(`user:${senderId}`).emit("call-billing-started", billingPayload);
                    io.to(`user:${receiverId}`).emit("call-billing-started", billingPayload);
                }

                logger.info(`Call ${request_id}: billing started. Affordable: ${affordableSeconds}s`);
                return { reconnected: false, started: true };
            } finally {
                await redisService.client.del(startLockKey);
            }
        } catch (error) {
            logger.error(`Error in markConnected for call ${request_id}:`, error);
            return { reconnected: false };
        }
    }

    /**
     * End a call: stop the billing monitor, end the conversation (which processes
     * the final charge), emit wallet updates, and clean up Redis state.
     *
     * Idempotent: if the call state has already been cleaned up, this is a no-op.
     *
     * @param {string} request_id - Call request ID
     * @param {object} [callData] - Pre-fetched call:{request_id} hash; fetched if omitted
     * @param {string} [reason] - Audit reason for the termination
     * @returns {Promise<object|undefined>} conversation/billing result
     */
    async endCall(request_id, callData = null, reason = "normal", triggeredByUserId = null) {
        try {
            if (!callData || !callData.conversationId) {
                callData = await redisService.client.hGetAll(`call:${request_id}`);
            }
            if (!callData || !callData.conversationId) {
                logger.info(`endCall: call ${request_id} already cleaned up (reason: ${reason})`);
                return;
            }

            const { conversationId, senderId, receiverId, payerId, earnerId } = callData;
            const actualPayerId = payerId || senderId;
            const actualEarnerId = earnerId || receiverId;
            const conversationService = require("./conversation.service");

            const pausedSeconds = await callDurationMonitor.stopMonitoring(request_id, {
                reason: `endCall:${reason}`,
                conversationId,
                callStatus: callData.status,
                trigger: "callLifecycle.endCall",
            });
            const result = await conversationService.endConversation(conversationId, {
                payerId: actualPayerId,
                pausedSeconds,
                io: this._io(),
                reason: CALL_END_REASON_MAP[reason] || "system",
                triggeredByUserId,
                source: `callLifecycle.endCall:${reason}`,
            });


            const io = this._io();
            if (io && result && result.billing) {
                const { payerTransaction, earnerTransaction } = result.billing;
                if (payerTransaction) {
                    io.to(`user:${actualPayerId}`).emit("wallet:balance_updated", {
                        type: "debit",
                        amount: payerTransaction.amount,
                        balanceAfter: payerTransaction.balanceAfter,
                    });

                    // Notify the payer to recharge if balance is now 0
                    if (payerTransaction.balanceAfter <= 0) {
                        io.to(`user:${actualPayerId}`).emit("wallet:recharge_required", {
                            reason: "balance_exhausted",
                            balanceAfter: payerTransaction.balanceAfter,
                            freeSecondsRemaining: 0,
                            serviceType: callData?.serviceType,
                            message: "Your wallet balance is \u20b90. Recharge to use services.",
                        });
                    }
                }
                if (earnerTransaction) {
                    io.to(`user:${actualEarnerId}`).emit("wallet:balance_updated", {
                        type: "credit",
                        amount: earnerTransaction.amount,
                        balanceAfter: earnerTransaction.balanceAfter,
                    });
                }
            }

            await Promise.all([
                redisService.client.del(`call:${request_id}`),
                redisService.client.del(`call:${conversationId}`),
                redisService.client.del(`call:${request_id}:connected`),
                redisService.client.del(`call:${request_id}:join_timeout`),
                redisService.client.del(`call:${request_id}:reconnect`),
            ]);

            logger.info(`Call ${request_id} ended (reason: ${reason})`);
            return result;
        } catch (error) {
            logger.error(`Error in endCall for ${request_id}:`, error);
        }
    }

    /**
     * One side hung up: end the call and tell both users to leave the room now.
     * `auto_leave` tells the app to leave the channel and close the screen without
     * an end-call dialog. Every device of both users is reached through user:<id>.
     *
     * @param {string} request_id - Call request ID
     * @param {string} leaverId - User who hung up
     * @param {string} [reason] - "user_ended" (call-end socket) or "peer_left" (left Agora)
     * @param {object} [callData] - Pre-fetched call:{request_id} hash
     * @returns {Promise<object|undefined>} conversation/billing result
     */
    async endCallForAll(request_id, leaverId, reason = "user_ended", callData = null) {
        if (!callData || !callData.conversationId) {
            callData = await redisService.client.hGetAll(`call:${request_id}`);
        }
        if (!callData || !callData.conversationId) {
            logger.info(`endCallForAll: call ${request_id} already cleaned up (reason: ${reason})`);
            return;
        }

        const result = await this.endCall(request_id, callData, reason, leaverId);
        this._emitCallEnded(callData, { request_id, sender_id: leaverId, reason });
        return result;
    }

    /**
     * Send call-ended to both participants so both screens close at once.
     * @private
     */
    _emitCallEnded(callData, payload) {
        const io = this._io();
        if (!io) return;
        io.to([`user:${callData.senderId}`, `user:${callData.receiverId}`])
            .emit("call-ended", { ...payload, auto_leave: true });
    }

    /**
     * Handle a participant leaving/disconnecting while the call is active.
     * Pauses billing and opens a reconnect grace window; if the participant does
     * not rejoin within RECONNECT_GRACE_SECONDS the call is auto-ended.
     *
     * @param {string} request_id - Call request ID
     * @param {string} userId - User ID that disconnected
     * @param {string} [reason] - Audit reason
     */
    async markDisconnected(request_id, userId, reason = "disconnect") {
        try {
            const uid = userId.toString();
            const callData = await redisService.client.hGetAll(`call:${request_id}`);
            if (!callData || !callData.conversationId) return;

            // Only "started" calls have an active billing monitor to pause.
            if (callData.status === "started") {
                logger.info(`Call ${request_id}: participant ${uid} disconnected (${reason}). Starting ${RECONNECT_GRACE_SECONDS}s grace period.`);

                await callDurationMonitor.pauseMonitoring(request_id);

                // Unique per disconnect so a timer from an earlier drop can't end the call
                // after the participant has reconnected and dropped again.
                const reconnectKey = `call:${request_id}:reconnect`;
                const reconnectMarker = `${uid}|${Date.now()}:${Math.random()}`;
                await redisService.client.set(reconnectKey, reconnectMarker, { EX: RECONNECT_KEY_TTL_SECONDS });

                const otherUserId = callData.senderId === uid ? callData.receiverId : callData.senderId;
                const io = this._io();
                if (io) {
                    io.to(`user:${otherUserId}`).emit("call-participant-disconnected", {
                        request_id,
                        userId,
                        message: `Participant disconnected. Waiting ${RECONNECT_GRACE_SECONDS}s for reconnect...`,
                    });
                }

                // Schedule auto-termination after the grace window
                this._scheduleReconnectTimeout(request_id, uid, reconnectMarker, RECONNECT_GRACE_SECONDS * 1000);
            } else if (callData.status === "accepted") {
                const isMediaCall = callData.serviceType === "audio_call" || callData.serviceType === "video_call";
                if (isMediaCall) {
                    // Accepted but billing never started — end cleanly, no charge.
                    logger.info(`Call ${request_id}: participant ${uid} disconnected before joining Agora. Ending without billing.`);
                    await this.endCall(request_id, callData, "disconnect_before_join");
                    this._emitCallEnded(callData, {
                        request_id,
                        sender_id: userId,
                        reason: "disconnect",
                    });
                } else {
                    logger.info(`Call ${request_id}: participant ${uid} disconnected while chat accepted. Ignoring for chat.`);
                }
            }
            // status "sent" (ringing): no conversation created, nothing to clean up.
        } catch (error) {
            logger.error(`Error in markDisconnected for ${request_id}:`, error);
        }
    }

    /**
     * End the call after delayMs unless the participant reconnected (the marker changed or is gone)
     * or the call already ended.
     * @private
     */
    _scheduleReconnectTimeout(request_id, uid, reconnectMarker, delayMs) {
        const reconnectKey = `call:${request_id}:reconnect`;
        setTimeout(async () => {
            try {
                const currentMarker = await redisService.client.get(reconnectKey);
                const stillReconnecting = currentMarker === reconnectMarker;
                if (stillReconnecting) {
                    logger.info(`Call ${request_id}: grace period expired for user ${uid}, ending call`);
                    const freshCallData = await redisService.client.hGetAll(`call:${request_id}`);
                    if (freshCallData && freshCallData.status === "started") {
                        await this.endCall(request_id, freshCallData, "reconnect_timeout");
                        this._emitCallEnded(freshCallData, {
                            request_id,
                            sender_id: uid,
                            reason: "reconnect_timeout",
                        });
                    }
                }
            } catch (err) {
                logger.error(`Error in reconnect timeout for call ${request_id}:`, err);
            }
        }, delayMs);
    }

    /**
     * Boot-time: re-arm the grace timers that were waiting when the previous process stopped.
     * Each marker is "<uid>|<disconnectedAtMs>:<random>", so the remaining window is known.
     * @returns {Promise<number>} timers re-armed
     */
    async recoverReconnectTimers() {
        let rearmed = 0;
        try {
            for await (const entry of redisService.client.scanIterator({ MATCH: "call:*:reconnect", COUNT: 100 })) {
                // node-redis v4 yields a key per step; v5 yields a batch (array) of keys.
                for (const key of [].concat(entry)) {
                    const marker = await redisService.client.get(key);
                    if (!marker) continue;
                    const [uid, rest = ""] = String(marker).split("|");
                    const disconnectedAt = parseInt(rest.split(":")[0], 10);
                    const request_id = key.slice("call:".length, -":reconnect".length);
                    const delayMs = Number.isFinite(disconnectedAt)
                        ? Math.max(0, disconnectedAt + RECONNECT_GRACE_SECONDS * 1000 - Date.now())
                        : RECONNECT_GRACE_SECONDS * 1000;
                    this._scheduleReconnectTimeout(request_id, uid, marker, delayMs);
                    rearmed += 1;
                }
            }
            if (rearmed) logger.info(`Re-armed ${rearmed} reconnect grace timer(s) after restart`);
        } catch (error) {
            logger.error("Error re-arming reconnect grace timers:", error);
        }
        return rearmed;
    }

    /**
     * Boot-time: a call was paused for a reconnect and its grace window ran out while the server
     * was down (the marker expired). End it as the lost timer would have.
     * @param {string} request_id - Call request ID
     */
    async endExpiredGrace(request_id) {
        const callData = await redisService.client.hGetAll(`call:${request_id}`);
        if (!callData || callData.status !== "started") return;
        logger.info(`Call ${request_id}: reconnect grace expired during restart, ending call`);
        await this.endCall(request_id, callData, "reconnect_timeout");
        this._emitCallEnded(callData, { request_id, reason: "reconnect_timeout" });
    }
}

module.exports = new CallLifecycleService();
module.exports.RECONNECT_GRACE_SECONDS = RECONNECT_GRACE_SECONDS;
