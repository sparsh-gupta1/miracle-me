const { Wallet, WalletTransaction, Ledger, User, CommunicationCharge, sequelize } = require("../models");
const logger = require("../utils/logger");
const { Op } = require("sequelize");
const crypto = require("crypto");

const toUUID = (str) => {
    if (!str) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(str)) return str;
    const hash = crypto.createHash("sha1").update(str).digest("hex");
    return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(12, 15)}-a${hash.substring(15, 18)}-${hash.substring(18, 30)}`;
};


class WalletService {

    /**
     * Get detailed wallet history for a user
     * @param {string} userId - User ID
     * @param {object} filters - Filter options
     * @param {object} pagination - Pagination options
     * @returns {Promise<object>}
     */
    async getWalletHistoryWithDetails(userId, filters = {}, pagination = {}) {
        try {
            const { page = 1, limit = 20 } = pagination;
            const offset = (page - 1) * limit;
            const walletType = filters.walletType || "main";

            // Determine which wallet IDs to query
            let walletIds = [];
            if (walletType === "all") {
                // Fetch all wallets for this user (main + earning)
                const wallets = await Wallet.findAll({ where: { userId } });
                walletIds = wallets.map(w => w.id);
            } else {
                const wallet = await this.getWalletByUserId(userId, walletType);
                walletIds = [wallet.id];
            }

            const where = { walletId: { [Op.in]: walletIds } };
            if (filters.type) {
                where.type = filters.type;
            }
            if (filters.referenceType) {
                where.referenceType = filters.referenceType;
            }

            const { count, rows } = await WalletTransaction.findAndCountAll({
                where,
                order: [["createdAt", "DESC"]],
                limit,
                offset,
                include: [
                    {
                        model: Wallet,
                        as: "wallet",
                        attributes: ["type"],
                    },
                    {
                        model: CommunicationCharge,
                        as: "charge",
                        required: false
                    }
                ]
            });

            // Map results to the requested format
            const transactions = rows.map(tx => {
                const charge = tx.charge;

                // Format duration if charge exists
                let duration = "N/A";
                if (charge && charge.durationSeconds) {
                    const minutes = Math.floor(charge.durationSeconds / 60);
                    const seconds = charge.durationSeconds % 60;
                    duration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }

                // Map display service type
                let displayServiceType = tx.referenceType;
                if (charge && charge.serviceType) {
                    displayServiceType = charge.serviceType;
                }

                return {
                    id: tx.id,
                    servicetype: displayServiceType,
                    cost: tx.amount,
                    commission: charge ? charge.commissionAmount : 0,
                    type: tx.type, // credit/debit
                    walletType: tx.wallet ? tx.wallet.type : walletType, // which wallet
                    duration,
                    balanceBefore: tx.balanceBefore,
                    balanceAfter: tx.balanceAfter,
                    description: tx.description,
                    createdAt: tx.createdAt,
                    referenceId: tx.referenceId
                };
            });

            return {
                transactions,
                totalCount: count,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                hasMore: offset + limit < count,
            };
        } catch (error) {
            logger.error("Error getting detailed wallet history:", error);
            throw error;
        }
    }

    /**
     * Create a new wallet for a user
     * @param {string} userId - User ID
     * @param {string} type - Wallet type (main, earning)
     * @param {object} transaction - Optional Sequelize transaction
     * @returns {Promise<Wallet>}
     */
    async createWallet(userId, type = "main", transaction = null) {
        try {
            const [wallet, created] = await Wallet.findOrCreate({
                where: { userId, type },
                defaults: {
                    userId,
                    type,
                    balance: 0.00,
                    currency: "INR",
                    isActive: true,
                },
                transaction,
            });

            if (created) {
                logger.info(`Wallet created for user ${userId} (type: ${type})`);
            } else {
                logger.info(`Wallet already exists for user ${userId} (type: ${type})`);
            }
            return wallet;
        } catch (error) {
            // Handle race condition or non-composite DB unique index on user_id:
            // If findOrCreate's INSERT fails with a unique violation, the wallet was
            // already created by another process — just fetch and return it.
            if (error.name === "SequelizeUniqueConstraintError") {
                logger.warn(`Unique constraint hit for wallet (user: ${userId}, type: ${type}) — fetching existing wallet`);
                const existing = await Wallet.findOne({ where: { userId, type }, transaction });
                if (existing) return existing;
            }
            if (error.name === "SequelizeForeignKeyConstraintError") {
                throw new Error("Wallet not found for this user");
            }
            logger.error("Error creating wallet:", error);
            throw error;
        }
    }

    /**
     * Ensure a user has all required wallets based on their role
     * @param {string} userId - User ID
     * @param {string} role - User role (user, listener, astrologer, etc.)
     * @param {object} transaction - Optional Sequelize transaction
     * @returns {Promise<void>}
     */
    async ensureUserWallets(userId, role, transaction = null) {
        try {
            // Everyone gets a main wallet
            await this.createWallet(userId, "main", transaction);

            // Listeners and astrologers also get an earning wallet
            if (role === "listener" || role === "astrologer") {
                await this.createWallet(userId, "earning", transaction);
            }
            logger.info(`Ensured wallets for user ${userId} with role ${role}`);
        } catch (error) {
            logger.error(`Error ensuring wallets for user ${userId}:`, error);
            // We don't throw to avoid blocking critical flows, but we log it
        }
    }

    /**
     * Get wallet by user ID and type
     * @param {string} userId - User ID
     * @param {string} type - Wallet type
     * @returns {Promise<Wallet>}
     */
    async getWalletByUserId(userId, type = "main") {
        try {
            const wallet = await Wallet.findOne({
                where: { userId, type },
                include: [
                    {
                        model: User,
                        as: "user",
                        attributes: ["id", "name", "email", "role"],
                    },
                ],
            });

            if (!wallet) {
                logger.info(`Wallet (${type}) not found for user ${userId}, creating one now...`);
                return await this.createWallet(userId, type);
            }

            return wallet;
        } catch (error) {
            logger.error("Error getting wallet:", error);
            throw error;
        }
    }

    /**
     * Get wallet balance
     * @param {string} userId - User ID
     * @param {string} type - Wallet type
     * @returns {Promise<number>}
     */
    async getWalletBalance(userId, type = "main") {
        try {
            const wallet = await this.getWalletByUserId(userId, type);
            return parseFloat(wallet.balance);
        } catch (error) {
            logger.error("Error getting wallet balance:", error);
            throw error;
        }
    }

    /**
     * Validate sufficient balance
     * @param {string} userId - User ID
     * @param {number} amount - Amount to validate
     * @param {string} type - Wallet type
     * @returns {Promise<boolean>}
     */
    async validateSufficientBalance(userId, amount, type = "main") {
        try {
            const balance = await this.getWalletBalance(userId, type);
            return balance >= parseFloat(amount);
        } catch (error) {
            logger.error("Error validating balance:", error);
            throw error;
        }
    }

    /**
     * Credit wallet (add funds) - ATOMIC OPERATION
     * @param {string} userId - User ID
     * @param {number} amount - Amount to credit
     * @param {string} referenceType - Type of reference (conversation, recharge, etc.)
     * @param {string} referenceId - Reference ID
     * @param {string} description - Transaction description
     * @param {object} externalTransaction - Optional external Sequelize transaction
     * @returns {Promise<WalletTransaction>}
     */
    async creditWallet(
        userId,
        amount,
        referenceType,
        referenceId,
        description,
        metadata = {},
        externalTransaction = null,
        walletType = "main" // Default to main, but should be explicit for internal calls
    ) {
        const t = externalTransaction || (await sequelize.transaction());
        const normalizedReferenceId = referenceId ? toUUID(referenceId) : null;

        try {
            logger.info(`Starting credit of ${amount} to ${walletType} wallet for user ${userId} (Ref: ${referenceType}/${normalizedReferenceId})`);

            // Validate amount is positive
            const creditAmount = parseFloat(amount);
            if (isNaN(creditAmount) || creditAmount <= 0) {
                throw new Error("Credit amount must be a positive number");
            }

            // Get or create wallet
            let wallet = await Wallet.findOne({
                where: { userId, type: walletType },
                transaction: t,
                lock: t.LOCK.UPDATE, // Row-level lock for concurrency safety
            });

            if (!wallet) {
                wallet = await this.createWallet(userId, walletType, t);
            }

            // Check for duplicate transaction (idempotency)
            if (normalizedReferenceId) {
                if (metadata?.billingSessionId) {
                    const existingWithSession = await WalletTransaction.findOne({
                        where: {
                            walletId: wallet.id,
                            referenceType,
                            referenceId: normalizedReferenceId,
                            metadata: {
                                billingSessionId: metadata.billingSessionId
                            }
                        },
                        transaction: t,
                    });

                    if (existingWithSession) {
                        logger.info(`Duplicate credit transaction detected for session ${metadata.billingSessionId}`);
                        if (!externalTransaction) await t.commit();
                        return existingWithSession;
                    }
                } else {
                    const existingTransaction = await WalletTransaction.findOne({
                        where: {
                            walletId: wallet.id,
                            referenceType,
                            referenceId: normalizedReferenceId,
                        },
                        transaction: t,
                    });

                    if (existingTransaction) {
                        logger.info(`Duplicate credit transaction detected for reference ${normalizedReferenceId}`);
                        if (!externalTransaction) await t.commit();
                        return existingTransaction;
                    }
                }
            }

            const balanceBefore = parseFloat(wallet.balance);
            const balanceAfter = balanceBefore + creditAmount;

            // Create wallet transaction
            const walletTransaction = await WalletTransaction.create(
                {
                    walletId: wallet.id,
                    type: "credit",
                    amount: creditAmount,
                    balanceBefore,
                    balanceAfter,
                    referenceType,
                    referenceId: normalizedReferenceId,
                    description,
                    metadata: metadata || {},
                },
                { transaction: t }
            );

            // Update wallet balance
            await wallet.update(
                {
                    balance: balanceAfter,
                    lastTransactionAt: new Date(),
                },
                { transaction: t }
            );

            // Create ledger entry (credit to user's wallet)
            await Ledger.create(
                {
                    walletTransactionId: walletTransaction.id,
                    debitWalletId: null, // External source
                    creditWalletId: wallet.id,
                    amount: creditAmount,
                    description,
                    metadata: { referenceType, referenceId: normalizedReferenceId },
                },
                { transaction: t }
            );

            if (!externalTransaction) await t.commit();

            logger.info(`Successfully credited ${creditAmount} to ${walletType} wallet ${wallet.id} for user ${userId}`);

            // Emit WebSocket update
            try {
                const { getIO } = require("../config/websocket");
                const { emitWalletBalanceUpdate, emitWalletTransactionCreated } = require("../websocket/handlers/wallet.handler");
                const io = getIO();

                emitWalletBalanceUpdate(io, userId, {
                    walletType,
                    balance: balanceAfter,
                    difference: creditAmount,
                    type: "credit"
                });

                emitWalletTransactionCreated(io, userId, walletTransaction, walletType);
            } catch (wsError) {
                logger.warn("Failed to emit wallet update via socket:", wsError.message);
            }

            return walletTransaction;
        } catch (error) {
            if (!externalTransaction) await t.rollback();
            logger.error("Error crediting wallet:", error);
            throw error;
        }
    }

    /**
     * Debit wallet (deduct funds) - ATOMIC OPERATION
     * @param {string} userId - User ID
     * @param {number} amount - Amount to debit
     * @param {string} referenceType - Type of reference (conversation, withdrawal, etc.)
     * @param {string} referenceId - Reference ID
     * @param {string} description - Transaction description
     * @param {object} externalTransaction - Optional external Sequelize transaction
     * @returns {Promise<WalletTransaction>}
     */
    async debitWallet(
        userId,
        amount,
        referenceType,
        referenceId,
        description,
        metadata = {},
        externalTransaction = null,
        walletType = "main" // Default to main, but should be explicit for internal calls
    ) {
        const t = externalTransaction || (await sequelize.transaction());
        const normalizedReferenceId = referenceId ? toUUID(referenceId) : null;

        try {
            logger.info(`Starting debit of ${amount} from ${walletType} wallet of user ${userId} (Ref: ${referenceType}/${normalizedReferenceId})`);

            // Validate amount is positive
            const debitAmount = parseFloat(amount);
            if (isNaN(debitAmount) || debitAmount <= 0) {
                throw new Error("Debit amount must be a positive number");
            }

            // Get wallet
            const wallet = await Wallet.findOne({
                where: { userId, type: walletType },
                transaction: t,
                lock: t.LOCK.UPDATE, // Row-level lock for concurrency safety
            });

            if (!wallet) {
                throw new Error("Wallet not found");
            }

            // Check for duplicate transaction (idempotency)
            if (normalizedReferenceId) {
                if (metadata?.billingSessionId) {
                    const existingWithSession = await WalletTransaction.findOne({
                        where: {
                            walletId: wallet.id,
                            referenceType,
                            referenceId: normalizedReferenceId,
                            metadata: {
                                billingSessionId: metadata.billingSessionId
                            }
                        },
                        transaction: t,
                    });

                    if (existingWithSession) {
                        logger.info(`Duplicate debit transaction detected for session ${metadata.billingSessionId}`);
                        if (!externalTransaction) await t.commit();
                        return existingWithSession;
                    }
                } else {
                    const existingTransaction = await WalletTransaction.findOne({
                        where: {
                            walletId: wallet.id,
                            referenceType,
                            referenceId: normalizedReferenceId,
                        },
                        transaction: t,
                    });

                    if (existingTransaction) {
                        logger.info(`Duplicate debit transaction detected for reference ${normalizedReferenceId}`);
                        if (!externalTransaction) await t.commit();
                        return existingTransaction;
                    }
                }
            }

            const balanceBefore = parseFloat(wallet.balance);
            const balanceAfter = balanceBefore - debitAmount;

            // Validate sufficient balance
            if (balanceAfter < 0) {
                throw new Error("Insufficient balance");
            }

            // Create wallet transaction
            const walletTransaction = await WalletTransaction.create(
                {
                    walletId: wallet.id,
                    type: "debit",
                    amount: debitAmount,
                    balanceBefore,
                    balanceAfter,
                    referenceType,
                    referenceId: normalizedReferenceId,
                    description,
                    metadata: metadata || {},
                },
                { transaction: t }
            );

            // Update wallet balance
            await wallet.update(
                {
                    balance: balanceAfter,
                    lastTransactionAt: new Date(),
                },
                { transaction: t }
            );

            // Create ledger entry (debit from user's wallet)
            await Ledger.create(
                {
                    walletTransactionId: walletTransaction.id,
                    debitWalletId: wallet.id,
                    creditWalletId: null, // External destination
                    amount: debitAmount,
                    description,
                    metadata: { referenceType, referenceId: normalizedReferenceId },
                },
                { transaction: t }
            );

            if (!externalTransaction) await t.commit();

            logger.info(`Successfully debited ${debitAmount} from ${walletType} wallet ${wallet.id} for user ${userId}`);

            // Emit WebSocket update
            try {
                const { getIO } = require("../config/websocket");
                const { emitWalletBalanceUpdate, emitWalletTransactionCreated } = require("../websocket/handlers/wallet.handler");
                const io = getIO();

                emitWalletBalanceUpdate(io, userId, {
                    walletType,
                    balance: balanceAfter,
                    difference: -debitAmount,
                    type: "debit"
                });

                emitWalletTransactionCreated(io, userId, walletTransaction, walletType);
            } catch (wsError) {
                logger.warn("Failed to emit wallet update via socket:", wsError.message);
            }

            return walletTransaction;
        } catch (error) {
            if (!externalTransaction) await t.rollback();
            logger.error("Error debiting wallet:", error);
            throw error;
        }
    }

    /**
     * Get wallet transactions with pagination
     * @param {string} userId - User ID
     * @param {object} filters - Filter options
     * @param {object} pagination - Pagination options
     * @returns {Promise<object>}
     */
    async getWalletTransactions(userId, filters = {}, pagination = {}) {
        try {
            const walletType = filters.walletType || "main";
            const wallet = await this.getWalletByUserId(userId, walletType);
            const { page = 1, limit = 20 } = pagination;
            const offset = (page - 1) * limit;

            const where = { walletId: wallet.id };

            if (filters.type) {
                where.type = filters.type;
            }

            if (filters.referenceType) {
                where.referenceType = filters.referenceType;
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

            const transactions = await WalletTransaction.findAndCountAll({
                where,
                order: [["createdAt", "DESC"]],
                limit,
                offset,
                include: [
                    {
                        model: Ledger,
                        as: "ledgerEntry",
                    },
                ],
            });

            return {
                transactions: transactions.rows,
                totalCount: transactions.count,
                currentPage: page,
                totalPages: Math.ceil(transactions.count / limit),
                hasMore: offset + limit < transactions.count,
            };
        } catch (error) {
            logger.error("Error getting wallet transactions:", error);
            throw error;
        }
    }

    /**
     * Get wallet statistics
     * @param {string} userId - User ID
     * @returns {Promise<object>}
     */
    async getWalletStats(userId, walletType = "main") {
        try {
            const wallet = await this.getWalletByUserId(userId, walletType);

            const [totalCredits, totalDebits, transactionCount] = await Promise.all([
                WalletTransaction.sum("amount", {
                    where: { walletId: wallet.id, type: "credit" },
                }),
                WalletTransaction.sum("amount", {
                    where: { walletId: wallet.id, type: "debit" },
                }),
                WalletTransaction.count({
                    where: { walletId: wallet.id },
                }),
            ]);

            return {
                currentBalance: parseFloat(wallet.balance),
                totalCredits: parseFloat(totalCredits || 0),
                totalDebits: parseFloat(totalDebits || 0),
                transactionCount,
                lastTransactionAt: wallet.lastTransactionAt,
            };
        } catch (error) {
            logger.error("Error getting wallet stats:", error);
            throw error;
        }
    }
}

module.exports = new WalletService();
