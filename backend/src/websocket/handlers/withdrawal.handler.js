const logger = require("../../utils/logger");
const withdrawalService = require("../../services/withdrawal.service");

/**
 * Withdrawal WebSocket event handlers
 * @param {object} io - Socket.IO server instance
 * @param {object} socket - Socket instance
 */
module.exports = (io, socket) => {
    const userId = socket.user?.id;
    const userRole = socket.user?.role;

    /**
     * Get current withdrawal rule
     */
    socket.on("withdrawal:get_rule", async () => {
        try {
            const rule = await withdrawalService.getCurrentWithdrawalRule();
            socket.emit("withdrawal:rule_res", { success: true, rule });
        } catch (error) {
            logger.error("Error getting withdrawal rule:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Validate withdrawal request
     */
    socket.on("withdrawal:validate", async (data) => {
        try {
            const { amount } = data;

            if (!amount) {
                return socket.emit("withdrawal:error", { message: "Amount is required" });
            }

            const validation = await withdrawalService.validateWithdrawalRequest(userId, amount);
            socket.emit("withdrawal:validation_res", { success: true, ...validation });
        } catch (error) {
            logger.error("Error validating withdrawal:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Create withdrawal request
     */
    socket.on("withdrawal:create", async (data) => {
        try {
            const { amount } = data;
            console.log("amount: ", amount);

            if (!amount) {
                return socket.emit("withdrawal:error", { message: "Amount is required" });
            }

            const request = await withdrawalService.createWithdrawalRequest(userId, amount);

            // Emit to user
            io.to(`user:${userId}`).emit("withdrawal:status_updated", {
                requestId: request.id,
                status: request.status,
                amount: request.amount,
                walletType: request.walletType,
                requestedAt: request.requestedAt,
            });

            // Emit to admins
            io.to("role:admin").emit("withdrawal:new_request", {
                requestId: request.id,
                userId: request.userId,
                amount: request.amount,
                walletType: request.walletType,
                requestedAt: request.requestedAt,
            });


            socket.emit("withdrawal:create_res", { success: true, request, walletType: request.walletType });
            logger.info(`Withdrawal request created: ${request.id}`);
        } catch (error) {
            logger.error("Error creating withdrawal request:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Get user's withdrawal requests
     */
    socket.on("withdrawal:get_my_requests", async (data) => {
        try {
            const { filters = {}, pagination = {} } = data || {};
            const result = await withdrawalService.getUserWithdrawals(userId, filters, pagination);
            socket.emit("withdrawal:my_requests_res", { success: true, ...result });
        } catch (error) {
            logger.error("Error getting withdrawal requests:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Get withdrawal statistics
     */
    socket.on("withdrawal:get_stats", async () => {
        try {
            const stats = await withdrawalService.getWithdrawalStats(userId);
            socket.emit("withdrawal:stats_res", { success: true, stats });
        } catch (error) {
            logger.error("Error getting withdrawal stats:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Admin: Get pending withdrawals
     */
    socket.on("withdrawal:get_pending", async (data) => {
        try {
            if (userRole !== "admin") {
                return socket.emit("withdrawal:error", { message: "Unauthorized: Admin access required" });
            }

            const { pagination = {} } = data || {};
            const result = await withdrawalService.getPendingWithdrawals(pagination);
            socket.emit("withdrawal:pending_res", { success: true, ...result });
        } catch (error) {
            logger.error("Error getting pending withdrawals:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Admin: Get all withdrawals (with filtering)
     * Supports filtering by status: 'pending', 'approved', 'rejected', or 'all'
     */
    socket.on("withdrawal:get_all", async (data) => {
        try {
            if (userRole !== "admin") {
                return socket.emit("withdrawal:error", { message: "Unauthorized: Admin access required" });
            }

            const { filters = {}, pagination = {} } = data || {};
            const result = await withdrawalService.getAllWithdrawals(filters, pagination);
            socket.emit("withdrawal:all_res", { success: true, ...result });
        } catch (error) {
            logger.error("Error getting all withdrawals:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Admin: Approve withdrawal
     */
    socket.on("withdrawal:approve", async (data) => {
        try {
            if (userRole !== "admin") {
                return socket.emit("withdrawal:error", { message: "Unauthorized: Admin access required" });
            }

            const { requestId } = data;

            if (!requestId) {
                return socket.emit("withdrawal:error", { message: "requestId is required" });
            }

            const result = await withdrawalService.approveWithdrawal(requestId, userId);

            if (result.rejected) {
                // Emit to user
                io.to(`user:${result.request.userId}`).emit("withdrawal:rejected", {
                    requestId: result.request.id,
                    reason: result.reason,
                    processedAt: result.request.processedAt,
                });

                // Emit to admins
                io.to("role:admin").emit("withdrawal:status_updated", {
                    requestId: result.request.id,
                    status: "rejected",
                    processedBy: userId,
                });

                socket.emit("withdrawal:approve_res", { success: true, result });
                logger.info(`Withdrawal automatically rejected during approval: ${requestId}`);
            } else {
                // Emit to user
                io.to(`user:${result.request.userId}`).emit("withdrawal:approved", {
                    requestId: result.request.id,
                    amount: result.request.amount,
                    processedAt: result.request.processedAt,
                });

                // Emit wallet balance update
                io.to(`user:${result.request.userId}`).emit("wallet:balance_updated", {
                    type: "debit",
                    amount: result.walletTransaction.amount,
                    balanceAfter: result.walletTransaction.balanceAfter,
                    description: "Withdrawal approved",
                });

                // Emit to admins
                io.to("role:admin").emit("withdrawal:status_updated", {
                    requestId: result.request.id,
                    status: "approved",
                    processedBy: userId,
                });

                socket.emit("withdrawal:approve_res", { success: true, result });
                logger.info(`Withdrawal approved: ${requestId}`);
            }
        } catch (error) {
            logger.error("Error approving withdrawal:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Admin: Reject withdrawal
     */
    socket.on("withdrawal:reject", async (data) => {
        try {
            if (userRole !== "admin") {
                return socket.emit("withdrawal:error", { message: "Unauthorized: Admin access required" });
            }

            const { requestId, reason } = data;

            if (!requestId) {
                return socket.emit("withdrawal:error", { message: "requestId is required" });
            }

            const request = await withdrawalService.rejectWithdrawal(requestId, userId, reason);

            // Emit to user
            io.to(`user:${request.userId}`).emit("withdrawal:rejected", {
                requestId: request.id,
                reason: request.rejectionReason,
                processedAt: request.processedAt,
            });

            // Emit to admins
            io.to("role:admin").emit("withdrawal:status_updated", {
                requestId: request.id,
                status: "rejected",
                processedBy: userId,
            });

            socket.emit("withdrawal:reject_res", { success: true, request });
            logger.info(`Withdrawal rejected: ${requestId}`);
        } catch (error) {
            logger.error("Error rejecting withdrawal:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });

    /**
     * Subscribe to withdrawal updates
     */
    socket.on("withdrawal:subscribe", () => {
        try {
            socket.join(`withdrawal:${userId}`);

            // If admin, join admin room for all withdrawal updates
            if (userRole === "admin") {
                socket.join("role:admin");
            }

            socket.emit("withdrawal:subscription_res", { success: true, message: "Subscribed to withdrawal updates" });
            logger.info(`User ${userId} subscribed to withdrawal updates`);
        } catch (error) {
            logger.error("Error subscribing to withdrawal updates:", error);
            socket.emit("withdrawal:error", { message: error.message });
        }
    });
};
