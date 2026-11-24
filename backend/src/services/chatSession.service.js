const logger = require("../utils/logger");
const redisService = require("./redis.service");
const conversationService = require("./conversation.service");
const billingService = require("./billing.service");
const { forEachLimit } = require("../utils/concurrency");

class ChatSessionService {
    constructor() {
        this.CHECK_INTERVAL = 60000; // Check every minute for idleness
        this.BALANCE_CHECK_INTERVAL = 5000; // Check every 5s for active balance
        this.IDLE_TIMEOUT = 300; // 5 minutes in seconds
        this.STARTUP_GRACE_PERIOD = 60000;
        this.NO_REPLY_TIMEOUT = 60; // seconds a started chat may wait for the first reply
        // Chats checked in parallel per balance pass; leaves most of the 20-connection DB pool free.
        this.BALANCE_CHECK_CONCURRENCY = 5;
        this.intervalId = null;
        this.balanceIntervalId = null;
        this._inFlight = {};
        this._skipped = {};
    }

    /**
     * Start the background monitor for chat sessions
     * @param {object} io - Socket.io instance
     */
    start(io) {
        if (this.intervalId) return;

        logger.info("Starting Chat Session Monitor (Idleness & Balance)");
        this.intervalId = setInterval(() => {
            this._runExclusive("idle", () => this.checkIdleSessions(io), this.CHECK_INTERVAL);
        }, this.CHECK_INTERVAL);

        this.balanceIntervalId = setInterval(() => {
            this._runExclusive("balance", () => this.checkActiveSessionBalances(io), this.BALANCE_CHECK_INTERVAL);
        }, this.BALANCE_CHECK_INTERVAL);
    }

    /**
     * Run one monitor pass unless the previous pass of the same kind is still running.
     * setInterval does not wait, so without this slow passes stack up and saturate the DB pool.
     * Slow or skipped passes are logged as CHAT_MONITOR_SLOW.
     * @param {string} name - Pass kind ("idle" | "balance")
     * @param {Function} fn - Async pass
     * @param {number} intervalMs - The pass's interval, to judge slowness
     */
    async _runExclusive(name, fn, intervalMs) {
        if (this._inFlight[name]) {
            this._skipped[name] = (this._skipped[name] || 0) + 1;
            return;
        }
        this._inFlight[name] = true;
        const startedAt = Date.now();
        try {
            await fn();
        } finally {
            this._inFlight[name] = false;
            const ms = Date.now() - startedAt;
            const skipped = this._skipped[name] || 0;
            if (ms > intervalMs / 2 || skipped) {
                logger.warn(`CHAT_MONITOR_SLOW pass=${name} ms=${ms} skippedTicks=${skipped}`);
                this._skipped[name] = 0;
            }
        }
    }

    /**
     * Stop the background monitor
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.balanceIntervalId) {
            clearInterval(this.balanceIntervalId);
            this.balanceIntervalId = null;
        }
    }

    /**
     * Check for idle chat sessions and end them
     * @param {object} io - Socket.io instance
     */
    async checkIdleSessions(io) {
        try {
            // Find all chats that are "started" but idle in Redis
            const { Chat } = require("../models");
            const startedChats = await Chat.findAll({
                where: { status: 'started', serviceType: 'chat' }
            });
            const now = Date.now();

            for (const chat of startedChats) {
                const activity = await redisService.getChatSessionActivity(chat.id);
                const createdAt = new Date(chat.createdAt).getTime();
                const startedAt = chat.startedAt ? new Date(chat.startedAt).getTime() : createdAt;
                const activityTimes = [createdAt, startedAt, new Date(chat.lastMessageAt || 0).getTime()];
                const redisActivityAt = activity?.updatedAt ? new Date(activity.updatedAt).getTime() : null;

                if (Number.isFinite(redisActivityAt)) activityTimes.push(redisActivityAt);
                const validActivityTimes = activityTimes.filter(Number.isFinite);
                if (validActivityTimes.length === 0) continue;

                const lastActivityAt = Math.max(...validActivityTimes);
                const elapsedMs = now - lastActivityAt;
                const inStartupGrace =
                    now - createdAt < this.STARTUP_GRACE_PERIOD ||
                    now - startedAt < this.STARTUP_GRACE_PERIOD;
                const activityKeyState = !activity
                    ? "absent"
                    : Number.isFinite(redisActivityAt) && now - redisActivityAt >= this.IDLE_TIMEOUT * 1000
                        ? "stale"
                        : "present";

                if (
                    inStartupGrace ||
                    elapsedMs < this.IDLE_TIMEOUT * 1000 ||
                    activityKeyState === "present"
                ) continue;

                logger.info(
                    `Chat session ${chat.id} timed out due to inactivity; ` +
                    `elapsedSeconds=${Math.floor(elapsedMs / 1000)} activityKey=${activityKeyState}. Ending session.`
                );
                await this.endChatSession(
                    chat.id,
                    io,
                    "inactivity",
                    "chatSession.inactivityMonitor"
                );
            }
        } catch (error) {
            logger.error("Error checking idle chat sessions:", error);
        }
    }

    /**
     * Check active chat sessions for balance exhaustion
     * @param {object} io - Socket.io instance
     */
    async checkActiveSessionBalances(io) {
        try {
            const { Chat, User } = require("../models");
            const startedChats = await Chat.findAll({
                where: { status: 'started', serviceType: 'chat' },
                include: [
                    { model: User, as: "participant1", attributes: ["id", "role"] },
                    { model: User, as: "participant2", attributes: ["id", "role"] },
                ]
            });
            
            if (!startedChats || startedChats.length === 0) return;

            await forEachLimit(startedChats, this.BALANCE_CHECK_CONCURRENCY, async (chat) => {
                // One chat failing must not skip the checks for the others.
                try {
                    await this._checkChatBalance(chat, io);
                } catch (error) {
                    logger.error(`Error checking balance for chat ${chat.id}:`, error);
                }
            });
        } catch (error) {
            logger.error("Error checking active chat balances:", error);
        }
    }

    /**
     * Check one started chat: close it if it got no reply, warn the payer, and end it when
     * free minutes and wallet balance are used up.
     * @param {object} chat - Started chat with participant1/participant2 (id, role)
     * @param {object} io - Socket.io instance
     */
    async _checkChatBalance(chat, io) {
        // Not connected yet (no reply): nothing is billed. Close it after the no-reply
        // window so both users are freed and nobody is charged.
        if (!chat.connectedAt) {
            const startedAt = chat.startedAt ? new Date(chat.startedAt).getTime() : new Date(chat.createdAt).getTime();
            if (Date.now() - startedAt >= this.NO_REPLY_TIMEOUT * 1000) {
                logger.info(`Chat session ${chat.id} got no reply within ${this.NO_REPLY_TIMEOUT}s, ending without charge`);
                await this.endChatSession(
                    chat.id,
                    io,
                    "no_response",
                    "chatSession.noReplyMonitor"
                );
            }
            return;
        }

        // Get payer
        const sessionPayerId = await redisService.getChatSessionPayerId(chat.id);
        // Fallback role resolution if explicit payer is missing
        let payerId = sessionPayerId;
        let earnerId = null;
        if (!payerId) {
            const resolved = conversationService.resolvePayerEarner({
                participant1: chat.participant1,
                participant2: chat.participant2
            });
            if (!resolved) {
                logger.error(`Cannot determine payer for chat ${chat.id} from roles. Skipping session.`);
                return;
            }
            payerId = resolved.payerId;
            earnerId = resolved.earnerId;
        } else {
            earnerId = chat.participant1Id === payerId ? chat.participant2Id : chat.participant1Id;
        }

        // Check live affordable balance
        let affordableSeconds;
        try {
            // readOnly: the monitor only needs the number; usage rows are kept in sync by the
            // message path and billing, so don't write them every 5s per chat.
            const balanceValidation = await conversationService.validateBalanceAndCalculateDuration(
                payerId,
                earnerId,
                "chat",
                { readOnly: true }
            );
            affordableSeconds = balanceValidation.affordableSeconds;
            await redisService.client.hSet(`chat-monitor:${chat.id}`, 'affordableSeconds', affordableSeconds.toString());
            await redisService.client.del(`monitor-fail:${chat.id}`);
        } catch (e) {
            const failKey = `monitor-fail:${chat.id}`;
            const fails = await redisService.client.incr(failKey);
            await redisService.client.expire(failKey, 60);

            if (fails >= 4) {
                logger.error(`Could not validate balance for chat ${chat.id} after 4 attempts: ${e.message}. Ending session.`);
                await this.endChatSession(
                    chat.id,
                    io,
                    "balance_exhausted",
                    "chatSession.balanceMonitor"
                );
                return;
            }

            const errorKey = `chat-monitor-error:${chat.id}`;
            const hasLogged = await redisService.client.exists(errorKey);
            if (!hasLogged) {
                logger.warn(`Could not validate balance for chat ${chat.id} (attempt ${fails}): ${e.message}`);
                await redisService.client.set(errorKey, "1", { EX: 3600 });
            }
                    
            const cached = await redisService.client.hGet(`chat-monitor:${chat.id}`, 'affordableSeconds');
            if (cached) {
                affordableSeconds = parseInt(cached, 10);
            } else {
                return;
            }
        }
                
        // Billing runs from the connection, not from the first (unanswered) message.
        const connectedAt = new Date(chat.connectedAt).getTime();
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - connectedAt) / 1000));
        const secondsRemaining = Math.max(0, affordableSeconds - elapsedSeconds);
        const percentageUsed = affordableSeconds > 0 ? (elapsedSeconds / affordableSeconds) * 100 : 100;

        const WARNING_THRESHOLDS = [90, 95];
        const warningsSentJson = await redisService.client.hGet(`chat-monitor:${chat.id}`, 'warningsSent');
        const warningsSent = warningsSentJson ? JSON.parse(warningsSentJson) : [];

        let warningEmitted = false;
        for (const threshold of WARNING_THRESHOLDS) {
            if (percentageUsed >= threshold && !warningsSent.includes(threshold.toString())) {
                const warningPayload = {
                    request_id: chat.id,
                    conversationId: chat.id,
                    percentageUsed,
                    secondsRemaining,
                    message: `You have ${secondsRemaining} seconds remaining`
                };

                io.to(`user:${payerId}`).emit('chat-duration-warning', warningPayload);

                warningsSent.push(threshold.toString());
                warningEmitted = true;
            }
        }
                
        if (warningEmitted) {
            await redisService.client.hSet(`chat-monitor:${chat.id}`, 'warningsSent', JSON.stringify(warningsSent));
        }

        if (percentageUsed >= 100) {
            logger.info(`Chat session ${chat.id} reached balance limit, auto-terminating`);
            await this.endChatSession(
                chat.id,
                io,
                "balance_exhausted",
                "chatSession.balanceMonitor"
            );
        }
    }

    /**
     * End a chat session and process billing
     * @param {string} chatId - Chat ID
     * @param {object} io - Socket.io instance
     * @param {string} reason - Reason for session end ('inactivity' | 'balance_exhausted')
     * @param {string|null} source - Audit source of the end
     * @param {string|null} explicitPayerId - Payer already resolved by the caller, if any
     */
    async endChatSession(chatId, io, reason, source = null, explicitPayerId = null) {
        try {
            const { Chat, User } = require("../models");
            const chat = await Chat.findByPk(chatId, {
                include: [
                    { model: User, as: "participant1", attributes: ["id", "role"] },
                    { model: User, as: "participant2", attributes: ["id", "role"] },
                ]
            });

            if (!chat || chat.status !== 'started') return;

            // Determine payer (same logic as billing service)
            // For now, let endConversation handle it or we pass the explicit payer if we know it
            // In chat, typically the initiator is the payer or we follow the role logic
            
            // Read stored payerId from Redis before activity key is deleted
            const sessionPayerId = await redisService.getChatSessionPayerId(chatId);

            // Pass payerId so billing uses the correct payer, not the fallback
            const result = await conversationService.endConversation(chatId, {
                payerId: explicitPayerId || sessionPayerId,
                pausedSeconds: 0,
                io,
                reason,
                source,
            });
            const { billing } = result;

            // Build reason-appropriate message
            const sessionEndedMessage = reason === "balance_exhausted"
                ? "Chat session ended: your balance is exhausted. Recharge to continue."
                : reason === "no_response"
                    ? "The listener didn't respond. You were not charged."
                    : "Chat session ended due to inactivity.";

            if (billing) {
                const { payerTransaction, earnerTransaction } = billing;

                const payerId = chat.participant1Id; // Fallback estimate
                const earnerId = chat.participant2Id;

                if (payerTransaction) {
                    io.to(`user:${payerTransaction.userId || payerId}`).emit("wallet:balance_updated", {
                        type: "debit",
                        amount: payerTransaction.amount,
                        balanceAfter: payerTransaction.balanceAfter
                    });

                    // Notify the payer to recharge if balance is now 0 (a balance_exhausted end
                    // sends its own prompt below, so skip it here to send it once).
                    if (payerTransaction.balanceAfter <= 0 && reason !== "balance_exhausted") {
                        io.to(`user:${payerTransaction.userId || payerId}`).emit("wallet:recharge_required", {
                            reason: "balance_exhausted",
                            balanceAfter: payerTransaction.balanceAfter,
                            freeSecondsRemaining: 0,
                            serviceType: "chat",
                            message: "Your wallet balance is \u20b90. Recharge to continue chatting.",
                        });
                    }
                }

                if (earnerTransaction) {
                    io.to(`user:${earnerTransaction.userId || earnerId}`).emit("wallet:balance_updated", {
                        type: "credit",
                        amount: earnerTransaction.amount,
                        balanceAfter: earnerTransaction.balanceAfter
                    });
                }
            }

            // Ran out of free minutes and wallet: always prompt the payer. A fully free session
            // has no debit (billing.payerTransaction is null), so it never got a prompt before.
            if (reason === "balance_exhausted") {
                const exhaustedPayerId = explicitPayerId || sessionPayerId
                    || billing?.payerTransaction?.userId
                    || conversationService.resolvePayerEarner({
                        participant1: chat.participant1,
                        participant2: chat.participant2,
                    })?.payerId;
                if (exhaustedPayerId) {
                    io.to(`user:${exhaustedPayerId}`).emit("wallet:recharge_required", {
                        reason: "balance_exhausted",
                        balanceAfter: billing?.payerTransaction?.balanceAfter ?? 0,
                        freeSecondsRemaining: 0,
                        serviceType: "chat",
                        message: "Your free minutes and wallet balance are used up. Recharge to continue chatting.",
                    });
                }
            }

            // Notify participants that session ended (always, even if billing was zero)
            const sessionEndedPayload = {
                chatId,
                durationSeconds: result.conversation?.durationSeconds ?? chat.durationSeconds,
                reason,
                message: sessionEndedMessage,
            };
            // Either side may have left the chat screen; reach both users directly too, or the
            // one who isn't looking stays "in session". One emit to all rooms so a socket in
            // several of them gets it once.
            const endedRooms = [`chat:${chatId}`, `user:${chat.participant1Id}`, `user:${chat.participant2Id}`];
            io.to(endedRooms).emit("chat-session-ended", sessionEndedPayload);

            await redisService.deleteChatSessionActivity(chatId);
            logger.info(`Chat session ${chatId} ended (reason: ${reason}) and billed.`);
        } catch (error) {
            logger.error(`Error ending chat session ${chatId}:`, error);
        }
    }
}

module.exports = new ChatSessionService();
