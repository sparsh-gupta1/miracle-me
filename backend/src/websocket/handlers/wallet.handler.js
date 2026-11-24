const logger = require("../../utils/logger");
const walletService = require("../../services/wallet.service");
const billingService = require("../../services/billing.service");

/**
 * Wallet WebSocket event handlers
 * @param {object} io - Socket.IO server instance
 * @param {object} socket - Socket instance
 */
module.exports = (io, socket) => {
    const userId = socket.user?.id;

    /**
     * Get wallet balance
     */
    socket.on("wallet:get_balance", async (data) => {
        try {
            const { walletType = "main" } = data || {};
            logger.info(`User ${userId} getting ${walletType} wallet balance`);
            const balance = await walletService.getWalletBalance(userId, walletType);
            logger.info(`User ${userId} ${walletType} wallet balance: ${balance}`);
            socket.emit("wallet:balance_res", { success: true, balance, walletType });
        } catch (error) {
            logger.error("Error getting wallet balance:", error);
            socket.emit("wallet:error", { message: error.message });
        }
    });

    /**
     * Get wallet details
     */
    socket.on("wallet:get_details", async (data) => {
        try {
            const { walletType = "main" } = data || {};
            const wallet = await walletService.getWalletByUserId(userId, walletType);
            socket.emit("wallet:details_res", { success: true, wallet, walletType });
        } catch (error) {
            logger.error("Error getting wallet details:", error);
            socket.emit("wallet:error", { message: error.message });
        }
    });

    /**
     * Get wallet transactions
     */
    socket.on("wallet:get_transactions", async (data) => {
        try {
            const { filters = {}, pagination = {} } = data || {};
            const result = await walletService.getWalletTransactions(userId, filters, pagination);
            socket.emit("wallet:transactions_res", { success: true, ...result });
        } catch (error) {
            logger.error("Error getting wallet transactions:", error);
            socket.emit("wallet:error", { message: error.message });
        }
    });

    /**
     * Get wallet statistics
     */
    socket.on("wallet:get_stats", async (data) => {
        try {
            const { walletType = "main" } = data || {};
            const stats = await walletService.getWalletStats(userId, walletType);
            socket.emit("wallet:stats_res", { success: true, stats, walletType });
        } catch (error) {
            logger.error("Error getting wallet stats:", error);
            socket.emit("wallet:error", { message: error.message });
        }
    });

    /**
     * Get listener earnings dashboard (today / this month)
     * Live updates are pushed as "earnings:updated" to the user's room.
     */
    socket.on("earnings:get_dashboard", async () => {
        try {
            const data = await billingService.getListenerEarningsDashboard(userId);
            socket.emit("earnings:dashboard_res", { success: true, data });
        } catch (error) {
            logger.error("Error getting earnings dashboard:", error);
            socket.emit("wallet:error", { message: error.message });
        }
    });

    /**
     * Subscribe to wallet updates
     */
    socket.on("wallet:subscribe", () => {
        try {
            socket.join(`wallet:${userId}`);
            socket.emit("wallet:subscription_res", { success: true, message: "Subscribed to wallet updates" });
            logger.info(`User ${userId} subscribed to wallet updates`);
        } catch (error) {
            logger.error("Error subscribing to wallet updates:", error);
            socket.emit("wallet:error", { message: error.message });
        }
    });

    /**
     * Unsubscribe from wallet updates
     */
    socket.on("wallet:unsubscribe", () => {
        try {
            socket.leave(`wallet:${userId}`);
            socket.emit("wallet:subscription_res", { success: true, message: "Unsubscribed from wallet updates" });
            logger.info(`User ${userId} unsubscribed from wallet updates`);
        } catch (error) {
            logger.error("Error unsubscribing from wallet updates:", error);
            socket.emit("wallet:error", { message: error.message });
        }
    });
};

/**
 * Helper function to emit wallet balance update
 * @param {object} io - Socket.IO server instance
 * @param {string} userId - User ID
 * @param {object} data - Update data
 */
const emitWalletBalanceUpdate = (io, userId, data) => {
    // data should include walletType
    io.to(`wallet:${userId}`).emit("wallet:balance_updated", data);
    io.to(`user:${userId}`).emit("wallet:balance_updated", data);
    logger.info(`Wallet (${data.walletType || 'main'}) balance update emitted for user ${userId}`);
};

/**
 * Helper function to emit wallet transaction created
 * @param {object} io - Socket.IO server instance
 * @param {string} userId - User ID
 * @param {object} transaction - Transaction data
 */
const emitWalletTransactionCreated = (io, userId, transaction, walletType = "main") => {
    const payload = { ...transaction.dataValues || transaction, walletType };
    io.to(`wallet:${userId}`).emit("wallet:transaction_created", payload);
    io.to(`user:${userId}`).emit("wallet:transaction_created", payload);
    logger.info(`Wallet (${walletType}) transaction created event emitted for user ${userId}`);
};

module.exports.emitWalletBalanceUpdate = emitWalletBalanceUpdate;
module.exports.emitWalletTransactionCreated = emitWalletTransactionCreated;
