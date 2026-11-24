const { Chat, User, ChatParticipant, ChatSetting, sequelize } = require("../models");
const { Op } = require("sequelize");
const logger = require("../utils/logger");
const { assertCanCommunicate } = require("../utils/communicationRules");
const billingService = require("./billing.service");
const walletService = require("./wallet.service");
const pricingService = require("./pricing.service");
const redisService = require("./redis.service");
const { emitStatus } = require("../websocket/presence");

const serviceTypeMap = {
    audio: "audio_call",
    video: "video_call",
    chat: "chat",
    audio_call: "audio_call",
    video_call: "video_call",
};

// How long an unresolved call request may keep a user "busy" before it is treated as stale.
// A running session is caught by its started chat first, so an accepted request only has to
// cover the gap until the session starts: the 30s Agora join timeout for calls and the 60s
// first-message timeout for chats, plus slack.
const PENDING_REQUEST_MAX_AGE_MS = 2 * 60 * 1000;
const ACCEPTED_REQUEST_MAX_AGE_MS = 2 * 60 * 1000;

const END_REASONS = [
    "manual",
    "disconnect",
    "inactivity",
    "no_response",
    "balance_exhausted",
    "call_duration_limit",
    "admin",
    "system",
];

class ConversationService {
    /**
     * Resolve payer and earner from participant roles.
     * The participant with role "user" pays; the other earns.
     */
    resolvePayerEarner({ participant1, participant2 }) {
        let payerId = null;
        let earnerId = null;
        
        const p1 = participant1;
        const p2 = participant2;

        if (p1 && p2) {
            if (p1.role === "user" && (p2.role === "listener" || p2.role === "astrologer")) {
                payerId = p1.id;
                earnerId = p2.id;
            } else if (p2.role === "user" && (p1.role === "listener" || p1.role === "astrologer")) {
                payerId = p2.id;
                earnerId = p1.id;
            }
        }

        if (!payerId) {
            return null;
        }

        return { payerId, earnerId };
    }

    /**
     * Normalize service type for database enum compatibility
     * @param {string} serviceType 
     * @returns {string}
     */
    normalizeServiceType(serviceType) {
        return serviceTypeMap[serviceType] || serviceType;
    }

    /**
     * Create a new conversation
     * @param {string} participant1Id - Initiator user ID
     * @param {string} participant2Id - Receiver user ID
     * @param {string} serviceType - Service type (chat, audio_call, video_call)
     * @returns {Promise<Chat>}
     */
    async createConversation(participant1Id, participant2Id, serviceType = "chat") {
        const normalizedServiceType = this.normalizeServiceType(serviceType);

        // Validate service type
        const validServiceTypes = ["chat", "audio_call", "video_call"];
        if (!validServiceTypes.includes(normalizedServiceType)) {
            throw new Error(`Invalid service type: ${serviceType}. Must be one of: ${validServiceTypes.join(", ")}`);
        }

        try {
            const [user1, user2] = await Promise.all([
                User.findByPk(participant1Id, { attributes: ["id", "role"] }),
                User.findByPk(participant2Id, { attributes: ["id", "role"] }),
            ]);
            if (!user1 || !user2) {
                throw new Error("User not found");
            }
            assertCanCommunicate(user1.role, user2.role);

            // Ensure consistent ordering to prevent duplicate chats
            const [p1Id, p2Id] = [participant1Id, participant2Id].sort();

            // Check if conversation already exists (including ended)
            let conversation = await Chat.findOne({
                where: {
                    participant1Id: p1Id,
                    participant2Id: p2Id,
                },
            });

            if (conversation) {
                if (conversation.status === "ended") {
                    logger.info(`Reusing ended conversation ${conversation.id} for new session`);
                    // Reset conversation for a new session
                    await conversation.update({
                        serviceType: normalizedServiceType,
                        status: "created",
                        endReason: null,
                        endedByUserId: null,
                        endTriggerSource: null,
                        startedAt: null,
                        connectedAt: null,
                        endedAt: null,
                        durationSeconds: null,
                        lastMessageAt: new Date(),
                    });
                } else {
                    logger.info(`Active conversation ${conversation.id} already exists`);
                    // A row that has not started yet is just a placeholder for the pair. Keep its
                    // type in step with what is being requested, otherwise cleanup that depends on
                    // the type (e.g. a call that never starts) treats a call as a chat.
                    if (conversation.status !== "started" && conversation.serviceType !== normalizedServiceType) {
                        await conversation.update({ serviceType: normalizedServiceType });
                    }
                }
                return conversation;
            }

            // Create new conversation
            conversation = await Chat.create({
                participant1Id: p1Id,
                participant2Id: p2Id,
                serviceType: normalizedServiceType,
                status: "created",
            });

            // Create ChatParticipant records if they don't exist
            await Promise.all([
                ChatParticipant.findOrCreate({
                    where: { chatId: conversation.id, userId: p1Id },
                    defaults: { chatId: conversation.id, userId: p1Id },
                }),
                ChatParticipant.findOrCreate({
                    where: { chatId: conversation.id, userId: p2Id },
                    defaults: { chatId: conversation.id, userId: p2Id },
                }),
            ]);

            logger.info(`Conversation created: ${conversation.id}`);
            return conversation;
        } catch (error) {
            logger.error("Error creating conversation:", error);
            throw error;
        }
    }

    /**
     * Validate user balance and calculate affordable duration
     * @param {string} payerId - Payer user ID
     * @param {string} earnerId - Earner user ID (listener/astrologer)
     * @param {string} serviceType - Service type (chat, audio_call, video_call)
     * @param {object} [options={}] - Options (e.g. { readOnly: true })
     * @returns {Promise<object>}
     */
    async validateBalanceAndCalculateDuration(payerId, earnerId, serviceType, options = {}) {
        const normalizedServiceType = this.normalizeServiceType(serviceType);

        try {
            // Get payer's wallet balance
            const balance = await walletService.getWalletBalance(payerId);

            // Get earner details for pricing
            const earner = await User.findByPk(earnerId, {
                attributes: ["id", "role"],
            });

            if (!earner) {
                throw new Error("Earner user not found");
            }

            // Get effective pricing for the service
            const pricingInfo = await pricingService.getEffectivePricing(earnerId, normalizedServiceType);

            const pricePerMinuteVal = pricingInfo.pricePerMinute !== undefined ? pricingInfo.pricePerMinute : pricingInfo.price_per_minute;
            if (!pricePerMinuteVal) {
                throw new Error(`No pricing configured for service type: ${normalizedServiceType}`);
            }

            const pricePerMinute = parseFloat(pricePerMinuteVal);
            const ratePerSecond = billingService.calculateRatePerSecond(pricePerMinute);

            // Calculate how many seconds the user can afford with wallet balance
            const paidAffordableSeconds = balance > 0 ? Math.floor(balance / ratePerSecond) : 0;
            const paidAffordableMinutes = Math.floor(paidAffordableSeconds / 60);

            // Get user's free minutes for this service type
            const freeMinutesService = require("./freeMinutes.service");
            
            let freeSecondsRemaining = 0;
            if (options.readOnly) {
                freeSecondsRemaining = await freeMinutesService.getUserFreeSecondsRemaining(payerId, normalizedServiceType);
            } else {
                const freeMinutesUsage = await freeMinutesService.getUserFreeMinutesUsage(
                    payerId,
                    normalizedServiceType
                );
                freeSecondsRemaining = freeMinutesUsage ? freeMinutesUsage.remaining_seconds : 0;
            }

            const freeMinutesRemaining = Math.floor(freeSecondsRemaining / 60);

            // Total affordable duration = free minutes + paid minutes
            const totalAffordableSeconds = freeSecondsRemaining + paidAffordableSeconds;
            const totalAffordableMinutes = Math.floor(totalAffordableSeconds / 60);

            // Check if user has sufficient balance (at least 1 minute total including free)
            // or if they have ANY free minutes remaining (as requested, bypass 60s check if free mins available)
            const hasSufficientBalance = totalAffordableSeconds >= 60 || freeSecondsRemaining > 0;

            logger.info(
                `Balance validation - User: ${payerId}, Balance: ₹${balance}, ` +
                `Free: ${freeSecondsRemaining}s (${freeMinutesRemaining}m), ` +
                `Paid: ${paidAffordableSeconds}s (${paidAffordableMinutes}m), ` +
                `Total: ${totalAffordableSeconds}s (${totalAffordableMinutes}m)`
            );

            return {
                balance,
                pricePerMinute,
                ratePerSecond,
                freeSecondsRemaining,
                freeMinutesRemaining,
                paidAffordableSeconds,
                paidAffordableMinutes,
                affordableSeconds: totalAffordableSeconds,
                affordableMinutes: totalAffordableMinutes,
                hasSufficientBalance,
                minimumBalanceRequired: freeSecondsRemaining >= 60 ? 0 : ratePerSecond * (60 - freeSecondsRemaining),
                pricingInfo: {
                    source: pricingInfo.source,
                    pricing_id: pricingInfo.pricing_id,
                },
            };
        } catch (error) {
            logger.error("Error validating balance and calculating duration:", error);
            throw error;
        }
    }

    /**
     * Start a conversation with balance validation
     * @param {string} conversationId - Conversation ID
     * @param {boolean} skipBalanceCheck - Skip balance validation (default: false)
     * @param {string|null} explicitPayerId - Explicit payer ID
     * @param {string|null} serviceType - Override service type
     * @param {object|null} io - Socket.IO server instance for broadcasting busy state changes
     * @param {object} [options]
     * @param {boolean} [options.awaitingReply] - Chat started by the payer's message: the session is
     *   not connected (and not billed) until the other side replies; see markChatConnected().
     * @returns {Promise<object>}
     */
    async startConversation(conversationId, skipBalanceCheck = false, explicitPayerId = null, serviceType = null, io = null, options = {}) {
        const t = await sequelize.transaction();
        try {
            const conversation = await Chat.findByPk(conversationId, {
                include: [
                    { model: User, as: "participant1", attributes: ["id", "role"], required: true },
                    { model: User, as: "participant2", attributes: ["id", "role"], required: true },
                ],
                transaction: t,
                // Lock only the chat row. A plain FOR UPDATE on this join also locks both users
                // rows, and the balance check below creates a missing wallet / free-minutes row
                // outside this transaction (FK → users), which then waits on us forever.
                lock: { level: t.LOCK.UPDATE, of: Chat },
            });

            if (!conversation) {
                await t.rollback();
                throw new Error("Conversation not found");
            }

            if (conversation.status === "started") {
                await t.rollback();
                logger.info(`Conversation ${conversationId} already started`);
                return { conversation };
            }

            // Optimized: Allow restarting ended conversations for reuse
            // We reset duration and endedAt to ensure a fresh session
            const isRestart = conversation.status === "ended";
            if (isRestart) {
                logger.info(`Restarting ended conversation ${conversationId}`);
            }

            // Identify payer and earner. A participant with role "user" always pays and is never
            // the earner (commission rules only exist for listener/astrologer), so role-based
            // resolution wins over the caller-supplied payer. The explicit payer only decides
            // peer sessions that have no "user" participant.
            let payerId = null;
            let earnerId = null;

            const byRole = this.resolvePayerEarner(conversation);
            if (byRole) {
                if (explicitPayerId && explicitPayerId !== byRole.payerId) {
                    logger.warn(
                        `startConversation ${conversationId}: explicit payer ${explicitPayerId} ignored; ` +
                        `participant with role "user" (${byRole.payerId}) pays.`
                    );
                }
                ({ payerId, earnerId } = byRole);
            } else if (explicitPayerId) {
                payerId = explicitPayerId;
                earnerId = conversation.participant1Id === payerId
                    ? conversation.participant2Id
                    : conversation.participant1Id;
            } else {
                // Fallback if we still can't determine (legacy behavior)
                logger.warn(
                    `startConversation ${conversationId}: could not determine payer by role. ` +
                    `Falling back to participant1Id. Pass explicitPayerId for peer sessions.`
                );
                payerId = conversation.participant1Id;
                earnerId = conversation.participant2Id;
            }

            // Validate/Calculate balance before starting
            let balanceValidation = null;
            const effectiveServiceType = serviceType || conversation.serviceType;
            try {
                balanceValidation = await this.validateBalanceAndCalculateDuration(
                    payerId,
                    earnerId,
                    effectiveServiceType
                );

                if (!skipBalanceCheck && !balanceValidation.hasSufficientBalance) {
                    throw new Error(
                        `Insufficient balance. You have ₹${balanceValidation.balance.toFixed(2)}, ` +
                        `but need at least ₹${balanceValidation.minimumBalanceRequired.toFixed(2)} ` +
                        `for 1 minute of ${effectiveServiceType}`
                    );
                }

                // FIX: Concurrent balance drain exploit.
                // Assumption pending Product Owner confirmation: Users are limited to 1 active paid session platform-wide.
                // If simultaneous sessions (e.g. 1 chat + 1 call) are legitimate, this either needs scoping by serviceType 
                // or transitioning to a balance-reservation hold system instead.
                const MAX_CONCURRENT_PAID_SESSIONS_PER_USER = 1;

                if (!skipBalanceCheck) {
                    // Lock the user row first to serialize concurrent requests and prevent count-then-update race
                    await User.findByPk(payerId, { transaction: t, lock: t.LOCK.UPDATE });

                    const activeCount = await Chat.count({
                        where: {
                            status: "started",
                            id: { [Op.ne]: conversationId },
                            [Op.or]: [
                                { participant1Id: payerId },
                                { participant2Id: payerId }
                            ]
                        },
                        transaction: t
                    });

                    if (activeCount >= MAX_CONCURRENT_PAID_SESSIONS_PER_USER) {
                        throw new Error("You already have an active paid session");
                    }
                }
            } catch (balanceError) {
                // If we're skipping the check, don't throw, just log and move on
                if (skipBalanceCheck) {
                    logger.warn("Non-blocking balance calculation failed during startConversation:", balanceError.message);
                } else {
                    logger.error("Blocking balance validation failed:", balanceError.message);
                    throw balanceError;
                }
            }

            const startedAt = new Date();
            const updateData = {
                status: "started",
                endReason: null,
                endedByUserId: null,
                endTriggerSource: null,
                startedAt,
                connectedAt: options.awaitingReply ? null : startedAt,
                endedAt: null,
                durationSeconds: null,
            };

            if (serviceType) {
                updateData.serviceType = serviceType;
            }

            await conversation.update(updateData, { transaction: t });

            // Mark participants as busy
            await User.update({ isBusy: true }, {
                where: {
                    id: { [Op.in]: [conversation.participant1Id, conversation.participant2Id] }
                },
                transaction: t
            });

            await t.commit();

            // Mirror busy state in Redis for fast O(1) lookup in WebSocket handlers.
            // Applies to all participants so users cannot be in multiple active sessions.
            const effectiveType = serviceType || conversation.serviceType || "chat";
            for (const p of [conversation.participant1, conversation.participant2]) {
                if (p) {
                    await redisService.setUserBusyStatus(p.id, conversationId, effectiveType).catch((err) =>
                        logger.warn(`[BusyFlag] Failed to set Redis busy for user ${p.id}: ${err.message}`)
                    );
                    // Broadcast real-time busy state to all connected clients
                    if (io) {
                        emitStatus(io, "listener:status-changed", {
                            listenerId: p.id,
                            isOnline: true,
                            isBusy: true,
                            busyType: effectiveType,
                        }, p.role);
                    }
                }
            }


            logger.info(
                `Conversation ${conversationId} started. ` +
                (balanceValidation ? `Affordable duration: ${balanceValidation.affordableMinutes}m` : "Balance check skipped")
            );

            return {
                conversation,
                balanceInfo: balanceValidation,
                payerId,
            };
        } catch (error) {
            if (!t.finished) {
                await t.rollback();
            }
            logger.error("Error starting conversation:", error);
            throw error;
        }
    }

    /**
     * Mark a started chat as connected (the other side replied). Billing counts from here.
     * Atomic and idempotent: only the first call for a session changes the row.
     * @param {string} chatId - Chat ID
     * @returns {Promise<boolean>} true if this call connected the chat
     */
    async markChatConnected(chatId) {
        const [updated] = await Chat.update(
            { connectedAt: new Date() },
            { where: { id: chatId, status: "started", connectedAt: null } }
        );
        if (updated > 0) {
            logger.info(`Chat ${chatId} connected: other side replied, billing starts now`);
        }
        return updated > 0;
    }

    /**
     * End a conversation and trigger billing
     * @param {string} conversationId - Conversation ID
     * @param {string} payerId - Optional explicit payer ID
     * @param {number} pausedSeconds - Reconnect grace seconds to exclude from the billed duration
     * @param {object|null} io - Socket.IO server instance for broadcasting busy state changes
     * @returns {Promise<object>}
     */
    async endConversation(conversationId, endOptions) {
        const {
            payerId = null,
            pausedSeconds = 0,
            io = null,
            reason,
            triggeredByUserId = null,
            source = null,
        } = endOptions || {};

        if (!END_REASONS.includes(reason)) {
            throw new TypeError(`A valid end reason is required. Received: ${reason}`);
        }

        const t = await sequelize.transaction();

        try {
            const conversation = await Chat.findByPk(conversationId, {
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!conversation) {
                throw new Error("Conversation not found");
            }

            if (conversation.status === "ended") {
                logger.info(`Conversation ${conversationId} already ended`);
                await t.commit();
                return { conversation, billing: null };
            }

            if (conversation.status !== "started") {
                // Conversation was never started (e.g. accepted but nobody joined Agora)
                // Clean up gracefully without billing
                logger.info(`Conversation ${conversationId} was never started (status: ${conversation.status}), skipping billing`);
                await conversation.update({
                    status: "ended",
                    endReason: reason,
                    endedByUserId: triggeredByUserId,
                    endTriggerSource: source,
                    endedAt: new Date(),
                    durationSeconds: 0,
                }, { transaction: t });

                const participantIds = [conversation.participant1Id, conversation.participant2Id];

                await this._closePairRequests(conversation, t);

                // The request that led here marked both users busy. Free them whatever type
                // the placeholder row carries (it is often still "chat" for a call).
                const neverStartedFree = await this._freeUsersInTransaction(participantIds, conversationId, t);

                await t.commit();
                await this._clearCallMirror(conversationId);
                await this._releaseBusyRedisAndEmit(conversationId, neverStartedFree, io);
                return { conversation, billing: null };
            }

            const endedAt = new Date();
            // Bill only from the moment the session connected. A chat the listener never
            // answered has no connectedAt: zero duration, so no charge and no free minutes used.
            const connectedAt = conversation.connectedAt;
            // Exclude reconnect grace windows (paused time) from the billed duration so users
            // are not charged for disconnect/reconnect gaps.
            const rawSeconds = connectedAt ? Math.floor((endedAt - connectedAt) / 1000) : 0;
            const durationSeconds = Math.max(0, rawSeconds - (parseInt(pausedSeconds, 10) || 0));
            if (!connectedAt) {
                logger.info(`Conversation ${conversationId} ended before it connected; not billing`);
            }

            await conversation.update(
                {
                    status: "ended",
                    endReason: reason,
                    endedByUserId: triggeredByUserId,
                    endTriggerSource: source,
                    endedAt,
                    durationSeconds,
                },
                { transaction: t }
            );

            // Close the CallRequest lifecycle: every open request for the pair, not just the newest
            // accepted one, or a leftover row keeps both users "busy" in isUserTrulyBusy().
            await this._closePairRequests(conversation, t);

            // Free participants in the DB inside the transaction. Redis and the broadcast
            // happen after commit so a rollback can't leave clients seeing "free" for a
            // conversation that is still started.
            const participantIds = [conversation.participant1Id, conversation.participant2Id];
            const startedFree = await this._freeUsersInTransaction(participantIds, conversationId, t);

            // Process billing if duration > 0
            let billingResult = null;
            if (durationSeconds > 0 && conversation.serviceType) {
                const billingTransaction = await sequelize.transaction({ transaction: t });
                try {
                    billingResult = await billingService.processConversationBilling(
                        conversationId,
                        payerId,
                        billingTransaction
                    );
                    await billingTransaction.commit();
                } catch (billingError) {
                    logger.error(`[Chat ${conversationId}] Billing failed, conversation will still be ended:`, billingError);
                    try { await billingTransaction.rollback(); } catch (e) { logger.error(`[Chat ${conversationId}] Billing savepoint rollback failed:`, e); }
                }
            }

            await t.commit();
            await this._clearCallMirror(conversationId);
            await this._releaseBusyRedisAndEmit(conversationId, startedFree, io);

            if (billingResult?.earnerId) {
                await billingService.emitEarningsUpdate(billingResult.earnerId);
            }

            logger.info(`Conversation ${conversationId} ended. Duration: ${durationSeconds}s`);
            return { conversation, billing: billingResult };
        } catch (error) {
            await t.rollback();
            logger.error("Error ending conversation:", error);
            throw error;
        }
    }

    /**
     * Get conversation details
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Chat>}
     */
    async getConversationDetails(conversationId) {
        try {
            const conversation = await Chat.findByPk(conversationId, {
                include: [
                    {
                        model: User,
                        as: "participant1",
                        attributes: ["id", "name", "role", "profileImage"],
                    },
                    {
                        model: User,
                        as: "participant2",
                        attributes: ["id", "name", "role", "profileImage"],
                    },
                ],
            });

            if (!conversation) {
                throw new Error("Conversation not found");
            }

            return conversation;
        } catch (error) {
            logger.error("Error getting conversation details:", error);
            throw error;
        }
    }

    /**
     * Get user's conversations
     * @param {string} userId - User ID
     * @param {object} filters - Filter options
     * @param {object} pagination - Pagination options
     * @returns {Promise<object>}
     */
    async getUserConversations(userId, filters = {}, pagination = {}) {
        try {
            const { page = 1, limit = 20 } = pagination;
            const offset = (page - 1) * limit;

            const where = {
                [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
            };

            if (filters.status) {
                where.status = filters.status;
            }

            if (filters.serviceType) {
                where.serviceType = filters.serviceType;
            }

            if (filters.startDate || filters.endDate) {
                where.createdAt = {};
                if (filters.startDate) {
                    where.createdAt[Op.gte] = new Date(filters.startDate);
                }
                if (filters.endDate) {
                    where.createdAt[Op.lte] = new Date(filters.endDate);
                }
            }

            const conversations = await Chat.findAndCountAll({
                where,
                order: [["createdAt", "DESC"]],
                limit,
                offset,
                include: [
                    {
                        model: User,
                        as: "participant1",
                        attributes: ["id", "name", "role", "profileImage"],
                    },
                    {
                        model: User,
                        as: "participant2",
                        attributes: ["id", "name", "role", "profileImage"],
                    },
                    {
                        model: ChatSetting,
                        as: "chatSettings",
                        where: { userId },
                        required: false,
                    },
                ],
            });

            const formattedConversations = conversations.rows.map(conv => {
                const convData = conv.get({ clone: true });
                const otherParticipantKey = conv.participant1Id === userId ? 'participant2' : 'participant1';

                if (conv.chatSettings && conv.chatSettings.customNickname) {
                    if (convData[otherParticipantKey]) {
                        convData[otherParticipantKey].name = conv.chatSettings.customNickname;
                    }
                }

                return convData;
            });

            return {
                conversations: formattedConversations,
                totalCount: conversations.count,
                currentPage: page,
                totalPages: Math.ceil(conversations.count / limit),
                hasMore: offset + limit < conversations.count,
            };
        } catch (error) {
            logger.error("Error getting user conversations:", error);
            throw error;
        }
    }

    /**
     * Get active conversations for a user
     * @param {string} userId - User ID
     * @returns {Promise<Array<Chat>>}
     */
    async getActiveConversations(userId) {
        try {
            const conversations = await Chat.findAll({
                where: {
                    [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
                    status: { [Op.in]: ["created", "started"] },
                },
                include: [
                    {
                        model: User,
                        as: "participant1",
                        attributes: ["id", "name", "role"],
                    },
                    {
                        model: User,
                        as: "participant2",
                        attributes: ["id", "name", "role"],
                    },
                    {
                        model: ChatSetting,
                        as: "chatSettings",
                        where: { userId },
                        required: false,
                    },
                ],
                order: [["createdAt", "DESC"]],
            });

            return conversations.map(conv => {
                const convData = conv.get({ clone: true });
                const otherParticipantKey = conv.participant1Id === userId ? 'participant2' : 'participant1';

                if (conv.chatSettings && conv.chatSettings.customNickname) {
                    if (convData[otherParticipantKey]) {
                        convData[otherParticipantKey].name = conv.chatSettings.customNickname;
                    }
                }

                return convData;
            });
        } catch (error) {
            logger.error("Error getting active conversations:", error);
            throw error;
        }
    }

    /**
     * Get conversation statistics for a user
     * @param {string} userId - User ID
     * @returns {Promise<object>}
     */
    async getConversationStats(userId) {
        try {
            const [totalConversations, activeConversations, endedConversations] = await Promise.all([
                Chat.count({
                    where: {
                        [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
                    },
                }),
                Chat.count({
                    where: {
                        [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
                        status: { [Op.in]: ["created", "started"] },
                    },
                }),
                Chat.count({
                    where: {
                        [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
                        status: "ended",
                    },
                }),
            ]);

            const totalDuration = await Chat.sum("durationSeconds", {
                where: {
                    [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
                    status: "ended",
                },
            });

            return {
                totalConversations,
                activeConversations,
                endedConversations,
                totalDurationSeconds: totalDuration || 0,
                totalDurationMinutes: Math.floor((totalDuration || 0) / 60),
            };
        } catch (error) {
            logger.error("Error getting conversation stats:", error);
            throw error;
        }
    }

    /**
     * Inside an end-of-session transaction: close every open request between the pair
     * (accepted -> ended, pending -> cancelled). A row left open makes isUserTrulyBusy()
     * report both users busy. Failures are logged, never fatal to ending the session.
     */
    async _closePairRequests(conversation, t) {
        try {
            const { CallRequest } = require("../models");
            const pairWhere = {
                [Op.or]: [
                    { senderId: conversation.participant1Id, receiverId: conversation.participant2Id },
                    { senderId: conversation.participant2Id, receiverId: conversation.participant1Id },
                ],
            };
            await CallRequest.update(
                { status: "ended" },
                { where: { ...pairWhere, status: "accepted" }, transaction: t }
            );
            await CallRequest.update(
                { status: "cancelled", cancellationTimestamp: new Date() },
                { where: { ...pairWhere, status: "pending" }, transaction: t }
            );
        } catch (err) {
            logger.error(`Error closing call requests for conversation ${conversation.id}:`, err);
        }
    }

    /**
     * After a session ends: drop the Redis call state left by the request that opened it
     * (`call:<conversationId>` mirror and `call:<requestId>`). Chat sessions ended by the
     * idle/balance/no-reply monitors never went through callLifecycle.endCall, so without this
     * the stale mirror outlives the session (no TTL). Never fatal.
     */
    async _clearCallMirror(conversationId) {
        try {
            const mirror = await redisService.client.hGetAll(`call:${conversationId}`);
            if (mirror?.requestId) await redisService.client.del(`call:${mirror.requestId}`);
            await redisService.client.del(`call:${conversationId}`);
        } catch (err) {
            logger.warn(`Could not clear call state for conversation ${conversationId}: ${err.message}`);
        }
    }

    /**
     * Inside an end-of-session transaction: clear the DB busy flag for every participant that has
     * no other started chat. A listener's manual "do not disturb" is never cleared here.
     * @returns {Promise<string[]>} ids that were freed (Redis + broadcast follow after commit)
     */
    async _freeUsersInTransaction(userIds, conversationId, t) {
        const freed = [];
        for (const pid of userIds) {
            const activeChat = await Chat.findOne({
                where: {
                    [Op.or]: [{ participant1Id: pid }, { participant2Id: pid }],
                    status: "started",
                    id: { [Op.ne]: conversationId }
                },
                transaction: t
            });
            if (activeChat) continue;
            await User.update(
                { isBusy: false },
                { where: { id: pid, isManualBusy: false }, transaction: t }
            );
            freed.push(pid);
        }
        return freed;
    }

    /**
     * After the DB side of a release is committed: drop the Redis busy hash (only when it belongs
     * to this conversation, so another session's flag is left alone) and tell clients. Each user is
     * handled independently and awaited, so one failure cannot skip the others or go unnoticed.
     */
    async _releaseBusyRedisAndEmit(conversationId, userIds, io = null, { force = false } = {}) {
        if (!userIds || userIds.length === 0) return;
        const chatId = conversationId ? String(conversationId) : null;

        let flags = [];
        try {
            flags = await User.findAll({
                where: { id: { [Op.in]: userIds } },
                attributes: ["id", "role", "manualOffline", "isManualBusy"],
            });
        } catch (err) {
            logger.warn(`[BusyFlag] Could not load user flags for broadcast: ${err.message}`);
        }
        const flagsById = new Map((flags || []).map((u) => [u.id, u]));

        for (const pid of userIds) {
            try {
                const busy = await redisService.getUserBusyStatus(pid);
                if (busy && chatId && !force && busy.conversationId !== chatId) {
                    continue; // busy with a different session now
                }
                await redisService.clearUserBusyStatus(pid);
            } catch (err) {
                logger.warn(`[BusyFlag] Failed to clear Redis busy for user ${pid}: ${err.message}`);
            }
            if (io) {
                const user = flagsById.get(pid);
                emitStatus(io, "listener:status-changed", {
                    listenerId: pid,
                    isOnline: !user?.manualOffline,
                    isBusy: !!user?.isManualBusy,
                    busyType: user?.isManualBusy ? "manual" : undefined,
                }, user?.role);
            }
        }
    }

    /**
     * Release busy state for users whose session ended or never started. Safe to call from any
     * cleanup path:
     *  - does nothing while the conversation itself is `started` (a live session owns the flags)
     *  - skips users who have another started chat
     *  - leaves Redis state that belongs to a different conversation alone (unless `force`)
     *  - never clears a listener's manual "do not disturb"
     *
     * @param {object} opts
     * @param {string|null} opts.conversationId
     * @param {string[]} opts.userIds
     * @param {object|null} [opts.io]
     * @param {boolean} [opts.force] - ignore Redis ownership (used when healing a flag known to be stale)
     * @returns {Promise<{freed: string[]}>}
     */
    async releaseBusyForSession({ conversationId = null, userIds, io = null, force = false }) {
        const ids = (userIds || []).filter(Boolean);
        if (ids.length === 0) return { freed: [] };

        if (conversationId) {
            const conversation = await Chat.findByPk(conversationId, { attributes: ["id", "status"] });
            if (conversation?.status === "started") return { freed: [] };
        }

        const freed = [];
        for (const pid of ids) {
            const activeChat = await Chat.findOne({
                where: {
                    [Op.or]: [{ participant1Id: pid }, { participant2Id: pid }],
                    status: "started",
                    ...(conversationId ? { id: { [Op.ne]: conversationId } } : {}),
                },
            });
            if (activeChat) continue;
            await User.update({ isBusy: false }, { where: { id: pid, isManualBusy: false } });
            freed.push(pid);
        }
        await this._releaseBusyRedisAndEmit(conversationId, freed, io, { force });
        return { freed };
    }

    /**
     * Release the busy state held by a chat/call request whose session never started, and close
     * the request rows and Redis call hashes that went with it. Used when the first message fails
     * to start the session (e.g. insufficient balance).
     *
     * @param {string} conversationId
     * @param {string[]} userIds
     * @param {object|null} io
     */
    async releaseUnstartedRequestState(conversationId, userIds, io = null) {
        const { CallRequest } = require("../models");

        const conversation = await Chat.findByPk(conversationId, {
            attributes: ["id", "status", "participant1Id", "participant2Id"],
        });
        // A started chat means the session did start; nothing here is stale.
        if (!conversation || conversation.status === "started") return { freed: [] };

        const pairWhere = {
            [Op.or]: [
                { senderId: conversation.participant1Id, receiverId: conversation.participant2Id },
                { senderId: conversation.participant2Id, receiverId: conversation.participant1Id },
            ],
        };
        await CallRequest.update({ status: "ended" }, { where: { ...pairWhere, status: "accepted" } });
        await CallRequest.update(
            { status: "cancelled", cancellationTimestamp: new Date() },
            { where: { ...pairWhere, status: "pending" } }
        );

        await this._clearCallMirror(conversationId);

        return this.releaseBusyForSession({ conversationId, userIds, io });
    }

    /**
     * Find a participant that must stop `conversationId` from starting: a listener's manual
     * do-not-disturb (for anyone but the user starting it), or a real session that belongs to a
     * different conversation. Flags that merely belong to this conversation's own request are
     * not a conflict. Stale flags are healed instead of blocking.
     *
     * @returns {Promise<{userId: string, reason: "manual"|"session"}|null>}
     */
    async findStartConflict(conversationId, userIds, starterId, io = null) {
        const chatId = String(conversationId);
        for (const uid of userIds) {
            const user = await User.findByPk(uid, { attributes: ["id", "isBusy", "isManualBusy"] });
            if (uid !== starterId && user?.isManualBusy) return { userId: uid, reason: "manual" };

            const otherStarted = await Chat.count({
                where: {
                    [Op.or]: [{ participant1Id: uid }, { participant2Id: uid }],
                    status: "started",
                    id: { [Op.ne]: conversationId },
                },
            });
            if (otherStarted > 0) return { userId: uid, reason: "session" };

            const busy = await redisService.getUserBusyStatus(uid);
            if (busy && busy.conversationId !== chatId) {
                const verified = await this.isUserTrulyBusy(uid);
                if (verified.status === "NOT_BUSY") {
                    await this.releaseBusyForSession({ userIds: [uid], io, force: true });
                } else {
                    return { userId: uid, reason: "session" };
                }
            }
        }
        return null;
    }

    /**
     * Busy info for a set of users, reconciling the three stores.
     *  - manual do-not-disturb       -> { isBusy: true, type: "manual" }
     *  - Redis session hash          -> { isBusy: true, type: <session type>, since }
     *  - DB flag with no Redis hash  -> verified against real sessions/requests; if nothing backs
     *                                   it the flag is stale: reported free and healed in the
     *                                   background (never labelled "manual")
     * A listener who is manually offline is reported not busy.
     *
     * @param {string[]} userIds
     * @param {object|null} io
     * @returns {Promise<Map<string, {isBusy: boolean, type: string|null, since: string|null}>>}
     */
    async getBusyInfo(userIds, io = null) {
        const result = new Map();
        const ids = [...new Set((userIds || []).filter(Boolean))];
        if (ids.length === 0) return result;

        const users = await User.findAll({
            where: { id: { [Op.in]: ids } },
            attributes: ["id", "isBusy", "isManualBusy", "manualOffline"],
        });

        for (const user of users) {
            if (user.manualOffline) {
                result.set(user.id, { isBusy: false, type: null, since: null });
                continue;
            }
            if (user.isManualBusy) {
                result.set(user.id, { isBusy: true, type: "manual", since: null });
                continue;
            }
            const busy = await redisService.getUserBusyStatus(user.id);
            if (busy) {
                // The hash is only a hint: a crash or failed clear can leave it behind for its
                // whole 2h TTL. Check it is still backed by a started chat or a live request.
                if (await this.isBusyHashLive(user.id, busy)) {
                    result.set(user.id, { isBusy: true, type: busy.type || "session", since: busy.since || null });
                } else {
                    this.releaseBusyForSession({ userIds: [user.id], io, force: true }).catch((err) =>
                        logger.warn(`[BusyFlag] Background heal of orphaned Redis busy failed for ${user.id}: ${err.message}`)
                    );
                    result.set(user.id, { isBusy: false, type: null, since: null });
                }
                continue;
            }
            if (!user.isBusy) {
                result.set(user.id, { isBusy: false, type: null, since: null });
                continue;
            }
            const verified = await this.isUserTrulyBusy(user.id);
            if (verified.status === "NOT_BUSY") {
                // Stale DB flag. Heal off the request path; the answer is "free" either way.
                this.releaseBusyForSession({ userIds: [user.id], io, force: true }).catch((err) =>
                    logger.warn(`[BusyFlag] Background heal failed for ${user.id}: ${err.message}`)
                );
                result.set(user.id, { isBusy: false, type: null, since: null });
            } else {
                result.set(user.id, { isBusy: true, type: "session", since: null });
            }
        }
        return result;
    }

    /**
     * Whether a Redis busy hash is still backed by something real: the conversation it names is
     * started, or the user has a live request (isUserTrulyBusy). A failed check counts as live,
     * so a DB hiccup never shows a busy listener as free.
     * @param {string} userId
     * @param {{conversationId: string}} busyHash - from redisService.getUserBusyStatus
     * @returns {Promise<boolean>}
     */
    async isBusyHashLive(userId, busyHash) {
        try {
            const chat = await Chat.findByPk(busyHash.conversationId, { attributes: ["id", "status"] });
            if (chat?.status === "started") return true;
        } catch (err) {
            logger.warn(`[BusyFlag] Could not load conversation ${busyHash.conversationId}: ${err.message}`);
            return true;
        }
        const verified = await this.isUserTrulyBusy(userId);
        return verified.status !== "NOT_BUSY";
    }

    /**
     * The session or open request currently occupying a user, for "you are already in a session"
     * errors. A started chat wins; otherwise the newest live (pending/accepted) request.
     * @param {string} userId
     * @returns {Promise<{chatId: string|null, peerId: string, peerName: string|null, type: string, started: boolean, requestId: string|null}|null>}
     */
    async getActiveSessionFor(userId) {
        const { CallRequest } = require("../models");
        const peerName = async (peerId) => {
            const peer = await User.findByPk(peerId, { attributes: ["id", "name"] });
            return peer?.name || null;
        };

        const chat = await Chat.findOne({
            where: {
                [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
                status: "started",
            },
            attributes: ["id", "participant1Id", "participant2Id", "serviceType"],
        });
        if (chat) {
            const peerId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
            return {
                chatId: chat.id,
                peerId,
                peerName: await peerName(peerId),
                type: chat.serviceType || "chat",
                started: true,
                requestId: null,
            };
        }

        const now = Date.now();
        const request = await CallRequest.findOne({
            where: {
                [Op.and]: [
                    { [Op.or]: [{ senderId: userId }, { receiverId: userId }] },
                    {
                        [Op.or]: [
                            { status: "pending", requestTimestamp: { [Op.gt]: new Date(now - PENDING_REQUEST_MAX_AGE_MS) } },
                            { status: "accepted", acceptanceTimestamp: { [Op.gt]: new Date(now - ACCEPTED_REQUEST_MAX_AGE_MS) } },
                        ],
                    },
                ],
            },
            order: [["requestTimestamp", "DESC"]],
        });
        if (!request) return null;

        const peerId = request.senderId === userId ? request.receiverId : request.senderId;
        const [p1Id, p2Id] = [userId, peerId].sort();
        const pairChat = await Chat.findOne({
            where: { participant1Id: p1Id, participant2Id: p2Id },
            attributes: ["id"],
        });
        return {
            chatId: pairChat?.id || null,
            peerId,
            peerName: await peerName(peerId),
            type: serviceTypeMap[request.requestType] || request.requestType,
            started: false,
            requestId: request.id,
        };
    }

    /**
     * Check if a user is truly busy with an active chat or call request
     * @param {string} userId - User ID
     * @returns {Promise<boolean>}
     */
    async isUserTrulyBusy(userId) {
        try {
            const { CallRequest } = require("../models");

            // Check for active chat (started)
            const activeChatCount = await Chat.count({
                where: {
                    [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
                    status: { [Op.in]: ["started"] }
                }
            });

            if (activeChatCount > 0) return { status: 'BUSY' };

            // Check for active call request (pending or accepted). Requests whose timers were
            // lost (restart) or whose session never started would otherwise count forever, so
            // each state only counts for as long as it can legitimately last:
            //  - pending: the 30s ring window plus slack
            //  - accepted: time to join Agora / send the first chat message
            const now = Date.now();
            const activeRequestCount = await CallRequest.count({
                where: {
                    [Op.and]: [
                        { [Op.or]: [{ senderId: userId }, { receiverId: userId }] },
                        {
                            [Op.or]: [
                                { status: "pending", requestTimestamp: { [Op.gt]: new Date(now - PENDING_REQUEST_MAX_AGE_MS) } },
                                { status: "accepted", acceptanceTimestamp: { [Op.gt]: new Date(now - ACCEPTED_REQUEST_MAX_AGE_MS) } },
                            ],
                        },
                    ],
                }
            });

            if (activeRequestCount > 0) return { status: 'BUSY' };

            return { status: 'NOT_BUSY' };
        } catch (error) {
            logger.error(`Error checking if user is truly busy for ${userId}:`, error);
            // Fail-safe: do not return true to avoid locking out, but explicitly say check failed
            return { status: 'CHECK_FAILED', error };
        }
    }
}

module.exports = new ConversationService();
