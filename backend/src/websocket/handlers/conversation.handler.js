const logger = require("../../utils/logger");
const conversationService = require("../../services/conversation.service");
const redisService = require("../../services/redis.service");
const callLifecycle = require("../../services/callLifecycle.service");
const { callerInSessionError, listenerBusyError } = require("../../utils/busyErrors");

/**
 * Conversation WebSocket event handlers
 * @param {object} io - Socket.IO server instance
 * @param {object} socket - Socket instance
 */
module.exports = (io, socket) => {
    const userId = socket.user?.id;

    /**
     * Create a new conversation
     */
    socket.on("conversation:create", async (data) => {
        try {
            const { participant2Id, serviceType } = data;

            if (!participant2Id) {
                return socket.emit("conversation:error", { message: "participant2Id is required" });
            }

            const conversation = await conversationService.createConversation(
                userId,
                participant2Id,
                serviceType || "chat"
            );

            // Emit to both participants
            io.to(`user:${userId}`).emit("conversation:created", conversation);
            io.to(`user:${participant2Id}`).emit("conversation:created", conversation);

            socket.emit("conversation:create_res", { success: true, conversation });
            logger.info(`Conversation created: ${conversation.id}`);
        } catch (error) {
            logger.error("Error creating conversation:", error);
            socket.emit("conversation:error", { message: error.message });
        }
    });

    /**
     * Validate balance before starting conversation
     */
    socket.on("conversation:validate_balance", async (data) => {
        try {
            const { participant2Id, serviceType } = data;

            if (!participant2Id) {
                return socket.emit("conversation:error", { message: "participant2Id is required" });
            }

            const balanceInfo = await conversationService.validateBalanceAndCalculateDuration(
                userId,
                participant2Id,
                serviceType || "chat"
            );

            socket.emit("conversation:validate_balance_res", { success: true, balanceInfo });
            logger.info(
                `Balance validated for user ${userId}: ` +
                `${balanceInfo.affordableMinutes}m affordable`
            );
        } catch (error) {
            logger.error("Error validating balance:", error);
            socket.emit("conversation:error", { message: error.message });
        }
    });

    /**
     * Start a conversation
     */
    socket.on("conversation:start", async (data) => {
        try {
            const { conversationId } = data;

            if (!conversationId) {
                return socket.emit("conversation:error", { message: "conversationId is required" });
            }

            const conversationCheck = await conversationService.getConversationDetails(conversationId);
            if (
                conversationCheck.participant1Id !== userId &&
                conversationCheck.participant2Id !== userId
            ) {
                logger.warn(
                    `Unauthorized conversation:start attempt chatId=${conversationId} attemptedByUserId=${userId}`
                );
                return socket.emit("conversation:error", {
                    message: "You are not a participant in this conversation",
                });
            }

            // Same rules as starting through send-message / call-request: respect a listener's
            // do-not-disturb and refuse to double-book someone who is in another session.
            const conflict = await conversationService.findStartConflict(
                conversationId,
                [conversationCheck.participant1Id, conversationCheck.participant2Id],
                userId,
                io
            );
            if (conflict) {
                // Say who is busy: the starter's own other session is not "the listener is busy".
                const payload = conflict.userId === userId
                    ? await callerInSessionError(conversationService, userId)
                    : listenerBusyError();
                return socket.emit("conversation:error", payload);
            }

            // Pass io so the busy broadcast reaches clients (it was silently skipped before).
            const result = await conversationService.startConversation(conversationId, false, null, null, io);
            const conversation = result.conversation;
            const balanceInfo = result.balanceInfo;

            // Join conversation room
            socket.join(`conversation:${conversationId}`);

            // Emit to all participants in the conversation
            io.to(`conversation:${conversationId}`).emit("conversation:started", {
                conversationId: conversation.id,
                startedAt: conversation.startedAt,
                status: conversation.status,
                balanceInfo: balanceInfo ? {
                    affordableSeconds: balanceInfo.affordableSeconds,
                    affordableMinutes: balanceInfo.affordableMinutes,
                    ratePerSecond: balanceInfo.ratePerSecond,
                } : null,
            });

            socket.emit("conversation:start_res", { success: true, conversation, balanceInfo });
            logger.info(
                `Conversation started: ${conversationId}` +
                (balanceInfo ? ` - Affordable: ${balanceInfo.affordableMinutes}m` : "")
            );
        } catch (error) {
            logger.error("Error starting conversation:", error);
            socket.emit("conversation:error", { message: error.message });
        }
    });

    /**
     * End a conversation
     */
    socket.on("conversation:end", async (data) => {
        try {
            const { conversationId } = data;

            if (!conversationId) {
                return socket.emit("conversation:error", { message: "conversationId is required" });
            }

            const conversation = await conversationService.getConversationDetails(conversationId);
            if (
                conversation.participant1Id !== userId &&
                conversation.participant2Id !== userId
            ) {
                logger.warn(
                    `Unauthorized conversation:end attempt chatId=${conversationId} attemptedByUserId=${userId}`
                );
                return socket.emit("conversation:end:error", {
                    message: "You are not a participant in this conversation",
                });
            }

            // A call's conversation also has a billing monitor, Redis call state and Agora
            // timers. Ending only the row left those behind (a leftover monitor could later end
            // a newer session on the same pair's row), so route it through the call lifecycle.
            let lifecycleResult = null;
            const callMirror = await redisService.client.hGetAll(`call:${conversationId}`);
            if (callMirror?.requestId) {
                lifecycleResult = await callLifecycle.endCall(callMirror.requestId, null, "user_ended", userId);
            }

            const result = lifecycleResult?.conversation
                ? lifecycleResult
                : await conversationService.endConversation(conversationId, {
                    io,
                    reason: "manual",
                    triggeredByUserId: userId,
                    source: "conversation:end socket",
                });

            // The peer is usually not in the conversation room (a chat screen joins chat:<id>,
            // a call screen only user:<id>), so it never heard the end and was stuck on screen.
            // Reach every room either side can be in; one emit, so a socket in several gets it once.
            const { participant1Id, participant2Id } = conversation;
            const endedRooms = [
                `conversation:${conversationId}`,
                `chat:${conversationId}`,
                `user:${participant1Id}`,
                `user:${participant2Id}`,
            ];
            io.to(endedRooms).emit("conversation:ended", {
                conversationId: result.conversation.id,
                endedAt: result.conversation.endedAt,
                durationSeconds: result.conversation.durationSeconds,
                status: result.conversation.status,
            });

            // Also send the event each screen already listens for.
            if (callMirror?.requestId) {
                io.to(endedRooms).emit("call-ended", {
                    request_id: callMirror.requestId,
                    sender_id: userId,
                    reason: "user_ended",
                    auto_leave: true,
                });
            } else {
                io.to(endedRooms).emit("chat-session-ended", {
                    chatId: conversationId,
                    durationSeconds: result.conversation.durationSeconds,
                    reason: "manual",
                    message: "Chat ended.",
                });
                // Stop the inactivity/balance monitor and clear both users' "in this chat" state.
                await redisService.deleteChatSessionActivity(conversationId);
                await Promise.all([participant1Id, participant2Id].map(
                    (uid) => redisService.removeUserFromActiveChat(uid, conversationId)
                ));
            }

            // If billing was processed, emit wallet balance updates
            if (result.billing) {
                const { payerTransaction, earnerTransaction } = result.billing;

                // Emit to payer
                if (payerTransaction) {
                    io.to(`user:${result.conversation.participant1Id}`).emit("wallet:balance_updated", {
                        type: "debit",
                        amount: payerTransaction.amount,
                        balanceAfter: payerTransaction.balanceAfter,
                        description: "Payment for conversation",
                    });
                }

                // Emit to earner
                if (earnerTransaction) {
                    io.to(`user:${result.conversation.participant2Id}`).emit("wallet:balance_updated", {
                        type: "credit",
                        amount: earnerTransaction.amount,
                        balanceAfter: earnerTransaction.balanceAfter,
                        description: "Earning from conversation",
                    });
                }
            }

            // Take both sides out of the conversation room, not just the one who ended it.
            io.in(`conversation:${conversationId}`).socketsLeave(`conversation:${conversationId}`);

            socket.emit("conversation:end_res", { success: true, result });
            logger.info(`Conversation ended: ${conversationId}`);
        } catch (error) {
            logger.error("Error ending conversation:", error);
            socket.emit("conversation:error", { message: error.message });
        }
    });

    /**
     * Join conversation room
     */
    socket.on("conversation:join", async (data) => {
        try {
            const { conversationId } = data;

            if (!conversationId) {
                return socket.emit("conversation:error", { message: "conversationId is required" });
            }

            // Verify user is participant
            const conversation = await conversationService.getConversationDetails(conversationId);

            if (
                conversation.participant1Id !== userId &&
                conversation.participant2Id !== userId
            ) {
                return socket.emit("conversation:error", { message: "You are not a participant in this conversation" });
            }

            socket.join(`conversation:${conversationId}`);

            // Emit participant joined event
            io.to(`conversation:${conversationId}`).emit("conversation:participant_joined", {
                conversationId,
                userId,
                joinedAt: new Date(),
            });

            socket.emit("conversation:join_res", { success: true });
            logger.info(`User ${userId} joined conversation ${conversationId}`);
        } catch (error) {
            logger.error("Error joining conversation:", error);
            socket.emit("conversation:error", { message: error.message });
        }
    });

    /**
     * Leave conversation room
     */
    socket.on("conversation:leave", async (data) => {
        try {
            const { conversationId } = data;

            if (!conversationId) {
                return socket.emit("conversation:error", { message: "conversationId is required" });
            }

            const conversation = await conversationService.getConversationDetails(conversationId);
            if (
                conversation.participant1Id !== userId &&
                conversation.participant2Id !== userId
            ) {
                return socket.emit("conversation:error", { message: "You are not a participant in this conversation" });
            }

            socket.leave(`conversation:${conversationId}`);

            // Emit participant left event
            io.to(`conversation:${conversationId}`).emit("conversation:participant_left", {
                conversationId,
                userId,
                leftAt: new Date(),
            });

            socket.emit("conversation:leave_res", { success: true });
            logger.info(`User ${userId} left conversation ${conversationId}`);
        } catch (error) {
            logger.error("Error leaving conversation:", error);
            socket.emit("conversation:error", { message: error.message });
        }
    });

    /**
     * Get active conversations
     */
    socket.on("conversation:get_active", async () => {
        try {
            const conversations = await conversationService.getActiveConversations(userId);
            socket.emit("conversation:active_res", { success: true, conversations });
        } catch (error) {
            logger.error("Error getting active conversations:", error);
            socket.emit("conversation:error", { message: error.message });
        }
    });
};
