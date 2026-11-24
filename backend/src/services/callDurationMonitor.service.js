const logger = require("../utils/logger");
const redisService = require("./redis.service");

class CallDurationMonitorService {
    constructor() {
        // Map to store active monitoring timers
        // Key: callId, Value: { intervalId, conversationId, io }
        this.activeMonitors = new Map();

        // Check interval in milliseconds (every 1 second)
        this.CHECK_INTERVAL = 1000;

        // Warning thresholds (percentage of affordable duration)
        this.WARNING_THRESHOLDS = [90, 95];

        // Safety net: auto-end a call if no liveness activity (Agora join, mute/video
        // toggle, or call-heartbeat) is seen for this many seconds. This guards against
        // a runaway charge when both clients crash AND no Agora leave / call-end ever
        // arrives. 0 = disabled (default). Enable only once clients send call-heartbeat
        // periodically, otherwise a healthy but quiet call could be ended prematurely.
        this.AUTO_END_INACTIVITY_SECONDS = parseInt(process.env.AUTO_END_INACTIVITY_SECONDS) || 0;
    }

    /**
     * Start monitoring a call's duration
     * @param {string} callId - Call request ID
     * @param {string} conversationId - Conversation ID
     * @param {string} senderId - Caller user ID
     * @param {string} receiverId - Receiver user ID
     * @param {number} affordableSeconds - Maximum affordable duration in seconds
     * @param {object} io - Socket.io instance
     * @param {string} serviceType - Service type
     * @param {string} [payerId] - Wallet that pays for the call (defaults to senderId; differs when a listener calls a user)
     * @param {string} [earnerId] - Wallet that earns from the call (defaults to receiverId)
     */
    async startMonitoring(callId, conversationId, senderId, receiverId, affordableSeconds, io, serviceType = "audio_call", payerId = senderId, earnerId = receiverId) {
        try {
            // Don't monitor if already monitoring this call
            if (this.activeMonitors.has(callId)) {
                logger.warn(`Call ${callId} is already being monitored`);
                return;
            }

            // Store call metadata in Redis
            await redisService.client.hSet(`call-monitor:${callId}`, {
                conversationId,
                senderId,
                receiverId,
                payerId: String(payerId || senderId),
                earnerId: String(earnerId || receiverId),
                startTime: new Date().toISOString(),
                affordableSeconds: affordableSeconds.toString(),
                serviceType: typeof serviceType !== 'undefined' ? serviceType : "audio_call",
                warningsSent: JSON.stringify([]),
                totalPausedSeconds: '0',
                lastActivityAt: new Date().toISOString(),
                lastBalanceCheckAt: new Date().toISOString(),
                status: 'monitoring'
            });

            // Start interval timer
            const intervalId = setInterval(() => {
                this._checkDuration(callId, io);
            }, this.CHECK_INTERVAL);

            // Store in memory
            this.activeMonitors.set(callId, {
                intervalId,
                conversationId,
                senderId,
                receiverId,
                io
            });

            logger.info(
                `Started monitoring call ${callId} - Affordable duration: ${affordableSeconds}s`
            );
        } catch (error) {
            logger.error(`Error starting call monitoring for ${callId}:`, error);
            throw error;
        }
    }

    /**
     * Stop monitoring a call
     * @param {string} callId - Call request ID
     * @returns {Promise<number>} Total paused (reconnect grace) seconds accumulated for this call,
     *                            so the caller can exclude them from the final bill. Defaults to 0.
     */
    async stopMonitoring(callId, context = {}) {
        try {
            const callState = await redisService.client.hGetAll(`call:${callId}`);
            const monitorState = await redisService.client.hGetAll(`call-monitor:${callId}`);
            const conversationState = monitorState.conversationId
                ? await redisService.client.hGetAll(`call:${monitorState.conversationId}`)
                : {};
            // Clear interval timer
            const monitor = this.activeMonitors.get(callId);
            // A call that ends while paused (grace timeout, channel destroyed) has an open
            // pause that resumeMonitoring never got to add; exclude it from the bill too.
            const openPauseSeconds = monitor?.pausedAt
                ? Math.max(0, Math.floor((Date.now() - monitor.pausedAt) / 1000))
                : 0;
            if (monitor) {
                clearInterval(monitor.intervalId);
                this.activeMonitors.delete(callId);
                logger.info(
                    `Stopped monitoring call ${callId} ` +
                    `(reason=${context.reason || "unspecified"}, ` +
                    `conversationId=${context.conversationId || monitorState.conversationId || "unknown"}, ` +
                    `callStatus=${context.callStatus || callState.status || "unknown"}, ` +
                    `conversationStatus=${context.conversationStatus || conversationState.status || "unknown"}, ` +
                    `trigger=${context.trigger || "call-duration-monitor"})`
                );
            }

            // Read the accumulated paused time before tearing down, so billing can exclude
            // reconnect grace windows from the charge.
            let totalPausedSeconds = 0;

            // Update status in Redis
            const exists = await redisService.client.exists(`call-monitor:${callId}`);
            if (exists) {
                const callData = await redisService.client.hGetAll(`call-monitor:${callId}`);
                totalPausedSeconds = (parseInt(callData.totalPausedSeconds || '0', 10) || 0) + openPauseSeconds;

                await redisService.client.hSet(`call-monitor:${callId}`, {
                    status: 'ended'
                });

                // Clean up after 1 hour (for debugging/audit purposes)
                await redisService.client.expire(`call-monitor:${callId}`, 3600);
            }

            return totalPausedSeconds;
        } catch (error) {
            logger.error(`Error stopping call monitoring for ${callId}:`, error);
            return 0;
        }
    }

    /**
     * Pause monitoring a call (e.g. on participant disconnect — reconnect grace period)
     * @param {string} callId - Call request ID
     */
    async pauseMonitoring(callId) {
        try {
            const monitor = this.activeMonitors.get(callId);
            if (!monitor) {
                logger.warn(`pauseMonitoring: No active monitor found for call ${callId}`);
                return;
            }

            // Already paused (duplicate disconnect signal): keep the original pausedAt so the
            // paused time isn't under-counted.
            if (monitor.pausedAt) return;

            // Stop the interval but keep the map entry so we can resume
            clearInterval(monitor.intervalId);
            monitor.intervalId = null;
            monitor.pausedAt = Date.now();

            await redisService.client.hSet(`call-monitor:${callId}`, {
                status: 'paused',
                pausedAt: new Date().toISOString()
            });

            logger.info(`Paused monitoring call ${callId}`);
        } catch (error) {
            logger.error(`Error pausing call monitoring for ${callId}:`, error);
        }
    }

    /**
     * Resume monitoring a paused call (e.g. on participant reconnect)
     * @param {string} callId - Call request ID
     * @param {object} io - Socket.io instance
     */
    async resumeMonitoring(callId, io) {
        try {
            const monitor = this.activeMonitors.get(callId);
            if (!monitor) {
                logger.warn(`resumeMonitoring: No active monitor found for call ${callId}`);
                return;
            }

            // Calculate how long the call was paused and add to totalPausedSeconds
            const pausedSeconds = monitor.pausedAt
                ? Math.floor((Date.now() - monitor.pausedAt) / 1000)
                : 0;

            monitor.pausedAt = null;

            // Atomically increment totalPausedSeconds in Redis
            const callData = await redisService.client.hGetAll(`call-monitor:${callId}`);
            const prevPausedSeconds = parseInt(callData.totalPausedSeconds || '0');
            const newTotalPausedSeconds = prevPausedSeconds + pausedSeconds;

            await redisService.client.hSet(`call-monitor:${callId}`, {
                status: 'monitoring',
                totalPausedSeconds: newTotalPausedSeconds.toString(),
                pausedAt: ''
            });

            // Restart the interval
            const intervalId = setInterval(() => {
                this._checkDuration(callId, io || monitor.io);
            }, this.CHECK_INTERVAL);

            monitor.intervalId = intervalId;

            logger.info(`Resumed monitoring call ${callId} (was paused ${pausedSeconds}s, total paused: ${newTotalPausedSeconds}s)`);
        } catch (error) {
            logger.error(`Error resuming call monitoring for ${callId}:`, error);
        }
    }

    /**
     * Record liveness activity for a call (Agora join, mute/video toggle, heartbeat).
     * Resets the inactivity auto-end timer. No-op if the call isn't being monitored.
     * @param {string} callId - Call request ID
     */
    async recordActivity(callId) {
        try {
            const exists = await redisService.client.exists(`call-monitor:${callId}`);
            if (!exists) return;
            await redisService.client.hSet(`call-monitor:${callId}`, {
                lastActivityAt: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Error recording activity for call ${callId}:`, error);
        }
    }

    /**
     * Check call duration and take action if needed
     * @private
     * @param {string} callId - Call request ID
     * @param {object} io - Socket.io instance
     */
    async _checkDuration(callId, io) {
        try {
            // Get call metadata from Redis
            const callData = await redisService.client.hGetAll(`call-monitor:${callId}`);

            if (!callData || !callData.startTime) {
                logger.warn(`No monitoring data found for call ${callId}, stopping monitor`);
                await this.stopMonitoring(callId, { reason: "monitor_data_missing", trigger: "_checkDuration" });
                return;
            }

            if (callData.status === 'ended') {
                await this.stopMonitoring(callId, { reason: "monitor_status_ended", trigger: "_checkDuration" });
                return;
            }

            // Inactivity safety net — auto-end if no liveness signal for too long.
            // Skipped while paused (reconnect grace handles that window separately).
            if (this.AUTO_END_INACTIVITY_SECONDS > 0 && callData.status !== 'paused' && callData.lastActivityAt) {
                const inactiveSeconds = Math.floor((Date.now() - new Date(callData.lastActivityAt).getTime()) / 1000);
                if (inactiveSeconds >= this.AUTO_END_INACTIVITY_SECONDS) {
                    logger.warn(`Call ${callId}: no activity for ${inactiveSeconds}s, auto-ending (inactivity_timeout)`);
                    await this._endForInactivity(callId, callData, io);
                    return;
                }
            }

            const startTime = new Date(callData.startTime);
            let affordableSeconds = parseInt(callData.affordableSeconds);
            const totalPausedSeconds = parseInt(callData.totalPausedSeconds || '0');
            // Monitor state written before payerId/earnerId existed (e.g. recovered after a
            // deploy) falls back to the caller-pays assumption.
            const payerId = callData.payerId || callData.senderId;
            const earnerId = callData.earnerId || callData.receiverId;
            // Subtract paused time so users are not billed during reconnect windows
            const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000) - totalPausedSeconds);

            // Re-fetch affordableSeconds live every 5 seconds to catch mid-call top-ups
            const lastBalanceCheckAt = callData.lastBalanceCheckAt ? new Date(callData.lastBalanceCheckAt).getTime() : 0;
            if (Date.now() - lastBalanceCheckAt >= 5000) {
                try {
                    const conversationService = require("./conversation.service");
                    // We need the serviceType. Since callData doesn't store it, we default to "audio_call" or fetch it.
                    // Wait, conversationService.validateBalanceAndCalculateDuration handles service type.
                    // Actually, let's store serviceType in callData when startMonitoring is called, or fetch it here.
                    const balanceValidation = await conversationService.validateBalanceAndCalculateDuration(
                        payerId,
                        earnerId,
                        callData.serviceType || "audio_call" 
                    );
                    affordableSeconds = balanceValidation.affordableSeconds;
                    await redisService.client.hSet(`call-monitor:${callId}`, {
                        affordableSeconds: affordableSeconds.toString(),
                        lastBalanceCheckAt: new Date().toISOString()
                    });
                    
                    await redisService.client.del(`monitor-fail:${callId}`);

                    // Keep the busy flags alive for as long as the call runs (they expire after 2h).
                    try {
                        await Promise.all([payerId, earnerId].map((uid) => redisService.refreshUserBusyTtl(uid)));
                    } catch (ttlError) {
                        logger.warn(`Could not refresh busy TTL for call ${callId}: ${ttlError.message}`);
                    }
                } catch (e) {
                    const failKey = `monitor-fail:${callId}`;
                    const fails = await redisService.client.incr(failKey);
                    await redisService.client.expire(failKey, 60);
                    
                    if (fails >= 4) {
                        logger.error(`Could not refresh balance for call ${callId} after 4 attempts: ${e.message}. Ending session.`);
                        await this._terminateCall(
                            callId,
                            callData.conversationId,
                            callData.senderId,
                            callData.receiverId,
                            elapsedSeconds,
                            io,
                            payerId,
                            earnerId
                        );
                        return;
                    } else {
                        logger.warn(`Could not refresh balance for call ${callId} (attempt ${fails}): ${e.message}`);
                    }
                }
            }

            const percentageUsed = affordableSeconds > 0 ? (elapsedSeconds / affordableSeconds) * 100 : 100;
            const secondsRemaining = Math.max(0, affordableSeconds - elapsedSeconds);

            const warningsSent = JSON.parse(callData.warningsSent || '[]');

            // Check if we need to send warnings
            for (const threshold of this.WARNING_THRESHOLDS) {
                if (percentageUsed >= threshold && !warningsSent.includes(threshold.toString())) {
                    await this._sendWarning(
                        callId,
                        callData.conversationId,
                        callData.senderId,
                        callData.receiverId,
                        threshold,
                        secondsRemaining,
                        io,
                        payerId
                    );

                    // Mark warning as sent
                    warningsSent.push(threshold.toString());
                    await redisService.client.hSet(`call-monitor:${callId}`, {
                        warningsSent: JSON.stringify(warningsSent)
                    });
                }
            }

            // Auto-terminate if time is up (100% or more)
            if (percentageUsed >= 100) {
                logger.info(`Call ${callId} reached time limit, auto-terminating`);
                await this._terminateCall(
                    callId,
                    callData.conversationId,
                    callData.senderId,
                    callData.receiverId,
                    elapsedSeconds,
                    io,
                    payerId,
                    earnerId
                );
            }
        } catch (error) {
            logger.error(`Error checking duration for call ${callId}:`, error);
        }
    }

    /**
     * Send warning notification to the payer
     * @private
     */
    async _sendWarning(callId, conversationId, senderId, receiverId, percentageUsed, secondsRemaining, io, payerId = senderId) {
        try {
            const warningPayload = {
                request_id: callId,
                conversationId,
                percentageUsed,
                secondsRemaining,
                message: `You have ${secondsRemaining} seconds remaining`
            };

            // Emit to the payer only (the caller, unless a listener started the call)
            io.to(`user:${payerId}`).emit('call-duration-warning', warningPayload);

            logger.info(
                `Sent ${percentageUsed}% warning for call ${callId} - ${secondsRemaining}s remaining`
            );
        } catch (error) {
            logger.error(`Error sending warning for call ${callId}:`, error);
        }
    }

    /**
     * Auto-terminate call when balance is exhausted
     * @private
     */
    async _terminateCall(callId, conversationId, senderId, receiverId, durationSeconds, io, payerId = senderId, earnerId = receiverId) {
        try {
            // Stop monitoring first; capture paused time so it's excluded from the bill.
            const pausedSeconds = await this.stopMonitoring(callId, {
                reason: "affordable_duration_exhausted",
                conversationId,
                trigger: "_terminateCall",
            });

            // Import conversation service here to avoid circular dependency
            const conversationService = require("./conversation.service");

            // End the conversation and process billing
            try {
                const result = await conversationService.endConversation(conversationId, {
                    payerId,
                    pausedSeconds,
                    // io lets endConversation broadcast that both users are free again.
                    io,
                    reason: "call_duration_limit",
                    source: "callDurationMonitor._terminateCall",
                });
                const { conversation, billing } = result;

                logger.info(
                    `Call ${callId} auto-ended. Conversation ${conversationId} duration: ${conversation.durationSeconds}s`
                );

                // Emit wallet balance updates if billing was processed
                if (billing) {
                    const { payerTransaction, earnerTransaction } = billing;

                    // Use payerId / earnerId from the call metadata — these are role-correct,
                    // unlike participant1Id/participant2Id which are sorted alphabetically,
                    // and unlike senderId/receiverId which swap when a listener starts the call.
                    if (payerTransaction) {
                        io.to(`user:${payerId}`).emit("wallet:balance_updated", {
                            type: "debit",
                            amount: payerTransaction.amount,
                            balanceAfter: payerTransaction.balanceAfter,
                            description: `Payment for ${conversation.serviceType} call (auto-ended)`,
                            conversationId: conversation.id,
                            durationSeconds: conversation.durationSeconds,
                        });
                    }

                    if (earnerTransaction) {
                        io.to(`user:${earnerId}`).emit("wallet:balance_updated", {
                            type: "credit",
                            amount: earnerTransaction.amount,
                            balanceAfter: earnerTransaction.balanceAfter,
                            description: `Earning from ${conversation.serviceType} call (auto-ended)`,
                            conversationId: conversation.id,
                            durationSeconds: conversation.durationSeconds,
                        });
                    }

                    // Emit billing summary — use role-correct senderId/receiverId
                    io.to(`user:${payerId}`).emit("call-billing-processed", {
                        conversationId: conversation.id,
                        durationSeconds: conversation.durationSeconds,
                        amountCharged: payerTransaction ? Math.abs(payerTransaction.amount) : 0,
                        balanceAfter: payerTransaction ? payerTransaction.balanceAfter : 0,
                    });

                    io.to(`user:${earnerId}`).emit("call-billing-processed", {
                        conversationId: conversation.id,
                        durationSeconds: conversation.durationSeconds,
                        amountEarned: earnerTransaction ? earnerTransaction.amount : 0,
                        balanceAfter: earnerTransaction ? earnerTransaction.balanceAfter : 0,
                    });
                }

                // The call ran until free minutes and wallet were used up, so always prompt the
                // payer. A fully free call has no debit (billing.payerTransaction is null), so
                // tying this to the debit left free-only calls ending with no prompt.
                io.to(`user:${payerId}`).emit("wallet:recharge_required", {
                    reason: "balance_exhausted",
                    balanceAfter: billing?.payerTransaction?.balanceAfter ?? 0,
                    freeSecondsRemaining: 0,
                    serviceType: conversation.serviceType,
                    message: "Call ended: your free minutes and wallet balance are used up. Recharge to make new calls.",
                });
            } catch (convError) {
                logger.error(`Failed to end conversation ${conversationId}:`, convError);
            }

            // Drop the call's Redis state. Left behind (no TTL), it let a late Agora event or
            // socket disconnect treat the already-ended call as live and end a newer session.
            try {
                await Promise.all([
                    redisService.client.del(`call:${callId}`),
                    redisService.client.del(`call:${conversationId}`),
                    redisService.client.del(`call:${callId}:connected`),
                    redisService.client.del(`call:${callId}:join_timeout`),
                    redisService.client.del(`call:${callId}:reconnect`),
                ]);
            } catch (cleanupError) {
                logger.warn(`Failed to clean call state for ${callId}: ${cleanupError.message}`);
            }

            // Emit auto-ended event to both participants
            const autoEndPayload = {
                request_id: callId,
                conversationId,
                reason: 'balance_exhausted',
                durationSeconds,
                message: 'Call ended: Balance exhausted'
            };

            io.to(`user:${senderId}`).emit('call-auto-ended', autoEndPayload);
            io.to(`user:${receiverId}`).emit('call-auto-ended', autoEndPayload);

            // Also emit standard call-ended event for compatibility. auto_leave: leave the
            // channel and close the screen without the end-call dialog.
            io.to(`user:${senderId}`).emit('call-ended', {
                request_id: callId,
                sender_id: receiverId,
                reason: 'balance_exhausted',
                auto_leave: true
            });
            io.to(`user:${receiverId}`).emit('call-ended', {
                request_id: callId,
                sender_id: senderId,
                reason: 'balance_exhausted',
                auto_leave: true
            });

            logger.info(`Auto-termination complete for call ${callId}`);
        } catch (error) {
            logger.error(`Error auto-terminating call ${callId}:`, error);
        }
    }

    /**
     * Auto-end a call that has gone inactive. Delegates the actual teardown
     * (stop monitor, end conversation + billing, clean up Redis) to the shared
     * callLifecycle service so behaviour matches the webhook / socket paths.
     * @private
     */
    async _endForInactivity(callId, callData, io) {
        try {
            // Lazy require avoids a circular dependency at module load time.
            const callLifecycle = require("./callLifecycle.service");
            await callLifecycle.endCall(callId, null, "inactivity_timeout");

            const { conversationId, senderId, receiverId } = callData;
            const payload = {
                request_id: callId,
                conversationId,
                reason: "inactivity_timeout",
                message: "Call ended: no activity detected",
            };
            if (io) {
                io.to(`user:${senderId}`).emit("call-auto-ended", payload);
                io.to(`user:${receiverId}`).emit("call-auto-ended", payload);
                io.to(`user:${senderId}`).emit("call-ended", { request_id: callId, sender_id: receiverId, reason: "inactivity_timeout", auto_leave: true });
                io.to(`user:${receiverId}`).emit("call-ended", { request_id: callId, sender_id: senderId, reason: "inactivity_timeout", auto_leave: true });
            }
        } catch (error) {
            logger.error(`Error auto-ending inactive call ${callId}:`, error);
        }
    }

    /**
     * Get monitoring status for a call
     * @param {string} callId - Call request ID
     * @returns {Promise<object|null>}
     */
    async getMonitoringStatus(callId) {
        try {
            const callData = await redisService.client.hGetAll(`call-monitor:${callId}`);

            if (!callData || !callData.startTime) {
                return null;
            }

            const startTime = new Date(callData.startTime);
            const affordableSeconds = parseInt(callData.affordableSeconds);
            const totalPausedSeconds = parseInt(callData.totalPausedSeconds || '0');
            const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000) - totalPausedSeconds);
            const secondsRemaining = Math.max(0, affordableSeconds - elapsedSeconds);

            return {
                conversationId: callData.conversationId,
                elapsedSeconds,
                affordableSeconds,
                secondsRemaining,
                totalPausedSeconds,
                percentageUsed: (elapsedSeconds / affordableSeconds) * 100,
                status: callData.status,
                warningsSent: JSON.parse(callData.warningsSent || '[]')
            };
        } catch (error) {
            logger.error(`Error getting monitoring status for call ${callId}:`, error);
            return null;
        }
    }

    /**
     * Clean up all active monitors (useful for graceful shutdown)
     */
    async cleanupAll() {
        logger.info(`Cleaning up ${this.activeMonitors.size} active call monitors`);

        for (const [callId] of this.activeMonitors) {
            await this.stopMonitoring(callId, { reason: "monitor_cleanup", trigger: "cleanupAll" });
        }
    }

    /**
     * Shutdown: stop every monitor's timer without touching Redis, so the next process can
     * recover the calls (unlike cleanupAll, which marks them ended).
     */
    suspendAll() {
        for (const monitor of this.activeMonitors.values()) {
            if (monitor.intervalId) clearInterval(monitor.intervalId);
            monitor.intervalId = null;
        }
        logger.info(`Suspended ${this.activeMonitors.size} call monitor(s) for shutdown`);
    }

    /**
     * Boot-time reconciliation to recover or safely end active calls after server restart.
     * @param {object} io - Socket.io instance
     */
    async recoverActiveSessions(io) {
        let recoverLockHeld = false;
        try {
            logger.info("Starting boot-time reconciliation for active calls...");

            // Take Redis lock so two instances do not both recover
            const lockAcquired = await redisService.client.set('recover-lock', 'locked', { NX: true, EX: 60 });
            if (!lockAcquired) {
                logger.info("Another instance is already recovering active sessions. Skipping.");
                return;
            }
            recoverLockHeld = true;

            const { Chat, User } = require("../models");
            const { Op } = require("sequelize");
            
            // Find all started audio/video calls
            const activeCalls = await Chat.findAll({
                where: { 
                    status: 'started',
                    serviceType: { [Op.in]: ['audio_call', 'video_call'] }
                },
                include: [
                    { model: User, as: "participant1", attributes: ["id", "role"] },
                    { model: User, as: "participant2", attributes: ["id", "role"] },
                ]
            });

            for (const call of activeCalls) {
                const conversationId = call.id;
                
                let cursor = "0";
                let foundCallId = null;
                let monitorData = null;
                
                do {
                    const reply = await redisService.client.scan(cursor, { MATCH: 'call-monitor:*', COUNT: 100 });
                    cursor = reply.cursor;
                    const keys = reply.keys || [];
                    
                    for (const key of keys) {
                        const callIdStr = key.replace('call-monitor:', '');
                        
                        // Skip any callId already in this.activeMonitors
                        if (this.activeMonitors.has(callIdStr)) {
                            continue;
                        }

                        const data = await redisService.client.hGetAll(key);
                        if (data && data.conversationId === conversationId && data.status !== 'ended') {
                            foundCallId = callIdStr;
                            monitorData = data;
                            break;
                        }
                    }
                    if (foundCallId) break;
                } while (String(cursor) !== "0");

                if (foundCallId && monitorData) {
                    logger.info(`Recovering monitor for call ${foundCallId} (conversation ${conversationId})`);
                    // It's not in activeMonitors map, so we restart the setInterval
                    if (!this.activeMonitors.has(foundCallId)) {
                        // A call paused for a reconnect stays paused: keep when the pause began so
                        // resume/stop exclude it from the bill, and leave the interval to resumeMonitoring.
                        const isPaused = monitorData.status === 'paused';
                        const pausedAtMs = isPaused
                            ? (Date.parse(monitorData.pausedAt) || Date.now())
                            : null;
                        const intervalId = isPaused ? null : setInterval(() => {
                            this._checkDuration(foundCallId, io);
                        }, this.CHECK_INTERVAL);

                        this.activeMonitors.set(foundCallId, {
                            intervalId,
                            pausedAt: pausedAtMs,
                            conversationId,
                            senderId: monitorData.senderId,
                            receiverId: monitorData.receiverId,
                            payerId: monitorData.payerId || monitorData.senderId,
                            earnerId: monitorData.earnerId || monitorData.receiverId,
                            io
                        });

                        // Its grace timer died with the old process. A live marker is re-armed by
                        // callLifecycle.recoverReconnectTimers(); an expired one means the window
                        // ran out while we were down, so end it now as the timer would have.
                        if (isPaused) {
                            const marker = await redisService.client.get(`call:${foundCallId}:reconnect`);
                            if (!marker) {
                                await require("./callLifecycle.service").endExpiredGrace(foundCallId);
                            }
                        }
                    }
                } else {
                    logger.warn(`No active monitor data found for started call ${conversationId}. Ending safely.`);
                    const conversationService = require("./conversation.service");
                    
                    const resolved = conversationService.resolvePayerEarner({
                        participant1: call.participant1,
                        participant2: call.participant2
                    });
                    
                    if (!resolved) {
                        logger.error(`Cannot determine payer for call ${conversationId} during recovery. Skipping session.`);
                        continue;
                    }

                    await conversationService.endConversation(conversationId, {
                        payerId: resolved.payerId,
                        pausedSeconds: 0,
                        reason: "system", // Fallback reason
                        source: "boot_reconciliation",
                        io
                    });
                }
            }
            logger.info("Boot-time reconciliation complete.");
        } catch (error) {
            logger.error("Error during boot-time reconciliation:", error);
        } finally {
            // Release the lock so a quick restart (deploy, crash loop) still recovers calls
            // instead of waiting out the 60s TTL.
            if (recoverLockHeld) {
                try {
                    await redisService.client.del('recover-lock');
                } catch (e) {
                    logger.error("Failed to release recover-lock:", e);
                }
            }
        }
    }
}

module.exports = new CallDurationMonitorService();
