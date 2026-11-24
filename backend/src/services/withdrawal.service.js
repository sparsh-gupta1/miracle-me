const {
    WithdrawalRule,
    WithdrawalRequest,
    User,
    sequelize,
} = require("../models");
const { Op } = require("sequelize");
const logger = require("../utils/logger");
const walletService = require("./wallet.service");

class WithdrawalService {
    /**
     * Create withdrawal rule
     * @param {object} data - { minAmount, allowedDays, effectiveFrom }
     * @param {string} adminId - Admin user ID
     * @returns {Promise<WithdrawalRule>}
     */
    async createWithdrawalRule(data, adminId) {
        try {
            const effectiveDate = data.effectiveFrom ? new Date(data.effectiveFrom) : new Date();

            const rule = await WithdrawalRule.create({
                minAmount: data.minAmount,
                allowedDays: data.allowedDays || [0, 1, 2, 3, 4, 5, 6],
                effectiveFrom: effectiveDate,
                createdBy: adminId,
                isActive: true,
            });

            logger.info(`Withdrawal rule created by admin ${adminId}`);
            return rule;
        } catch (error) {
            logger.error("Error creating withdrawal rule:", error);
            throw error;
        }
    }

    /**
     * Update withdrawal rule
     * @param {string} ruleId - Rule ID
     * @param {object} data - Update data
     * @returns {Promise<WithdrawalRule>}
     */
    async updateWithdrawalRule(ruleId, data) {
        try {
            const rule = await WithdrawalRule.findByPk(ruleId);
            if (!rule) {
                throw new Error("Withdrawal rule not found");
            }

            await rule.update({
                minAmount: data.minAmount !== undefined ? data.minAmount : rule.minAmount,
                allowedDays: data.allowedDays !== undefined ? data.allowedDays : rule.allowedDays,
                isActive: data.isActive !== undefined ? data.isActive : rule.isActive,
            });

            logger.info(`Withdrawal rule ${ruleId} updated`);
            return rule;
        } catch (error) {
            logger.error("Error updating withdrawal rule:", error);
            throw error;
        }
    }

    /**
     * Get current active withdrawal rule
     * @returns {Promise<WithdrawalRule|null>}
     */
    async getCurrentWithdrawalRule() {
        try {
            return await WithdrawalRule.findOne({
                where: {
                    isActive: true,
                    effectiveFrom: { [Op.lte]: new Date() },
                },
                order: [["effectiveFrom", "DESC"]],
            });
        } catch (error) {
            logger.error("Error getting current withdrawal rule:", error);
            throw error;
        }
    }

    /**
     * Get all withdrawal rules
     * @returns {Promise<Array<WithdrawalRule>>}
     */
    async getAllWithdrawalRules() {
        try {
            return await WithdrawalRule.findAll({
                order: [["effectiveFrom", "DESC"]],
                include: [
                    {
                        model: User,
                        as: "creator",
                        attributes: ["id", "name", "email"],
                    },
                ],
            });
        } catch (error) {
            logger.error("Error getting withdrawal rules:", error);
            throw error;
        }
    }

    /**
     * Validate withdrawal request
     * @param {string} userId - User ID
     * @param {number} amount - Withdrawal amount
     * @returns {Promise<object>}
     */
    async validateWithdrawalRequest(userId, amount) {
        try {
            const errors = [];

            // Get current rule
            const rule = await this.getCurrentWithdrawalRule() || {
                minAmount: 5,
                allowedDays: [0, 1, 2, 3, 4, 5, 6],
            };

            if (!rule) {
                errors.push("No active withdrawal rule configured");
                return { isValid: false, errors };
            }

            // Check minimum amount
            if (parseFloat(amount) < parseFloat(rule.minAmount)) {
                errors.push(`Minimum withdrawal amount is ${parseFloat(rule.minAmount)}`);
            }

            // Check allowed days
            const today = new Date().getDay(); // 0 = Sunday, 6 = Saturday
            if (!rule.allowedDays.includes(today)) {
                const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                const allowedDayNames = rule.allowedDays.map(d => dayNames[d]).join(", ");
                errors.push(`Withdrawals are only allowed on: ${allowedDayNames}`);
            }

            // Check sufficient balance
            const hasSufficientBalance = await walletService.validateSufficientBalance(userId, amount, "earning");
            if (!hasSufficientBalance) {
                errors.push("Insufficient earning wallet balance");
            }

            // Check for pending withdrawal requests
            const pendingRequest = await WithdrawalRequest.findOne({
                where: { userId, status: "pending" },
            });

            if (pendingRequest) {
                errors.push("You already have a pending withdrawal request");
            }

            return {
                isValid: errors.length === 0,
                errors,
                rule,
            };
        } catch (error) {
            logger.error("Error validating withdrawal request:", error);
            throw error;
        }
    }

    /**
     * Create withdrawal request
     * @param {string} userId - User ID
     * @param {number} amount - Withdrawal amount
     * @returns {Promise<WithdrawalRequest>}
     */
    async createWithdrawalRequest(userId, amount) {
        try {
            // Validate request
            const validation = await this.validateWithdrawalRequest(userId, amount);
            if (!validation.isValid) {
                throw new Error(validation.errors.join(", "));
            }

            const request = await WithdrawalRequest.create({
                userId,
                amount,
                walletType: "earning",
                status: "pending",
                requestedAt: new Date(),
            });

            logger.info(`Withdrawal request created for user ${userId}, amount: ${amount}`);
            return request;
        } catch (error) {
            logger.error("Error creating withdrawal request:", error);
            throw error;
        }
    }

    /**
     * Approve withdrawal request
     * @param {string} requestId - Request ID
     * @param {string} adminId - Admin user ID
     * @returns {Promise<object>}
     */
    async approveWithdrawal(requestId, adminId) {
        const t = await sequelize.transaction();

        try {
            const request = await WithdrawalRequest.findByPk(requestId, {
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!request) {
                throw new Error("Withdrawal request not found");
            }

            if (request.status !== "pending") {
                throw new Error(`Withdrawal request is already ${request.status}`);
            }

            // Debit wallet (which atomically checks for sufficient balance)
            let walletTransaction;
            try {
                walletTransaction = await walletService.debitWallet(
                    request.userId,
                    request.amount,
                    "withdrawal",
                    requestId,
                    "Withdrawal approved",
                    {}, // metadata
                    t,
                    "earning"
                );
            } catch (debitError) {
                if (debitError.message === "Insufficient balance") {
                    // Race condition hit: balance dropped between request and approval
                    await request.update(
                        {
                            status: "rejected",
                            processedAt: new Date(),
                            processedBy: adminId,
                            rejectionReason: "Insufficient balance at time of approval",
                        },
                        { transaction: t }
                    );
                    await t.commit();
                    logger.info(`Withdrawal request ${requestId} automatically rejected due to insufficient balance during approval`);
                    return { request, rejected: true, reason: "Insufficient balance at time of approval" };
                }
                throw debitError;
            }

            // Update request
            await request.update(
                {
                    status: "approved",
                    processedAt: new Date(),
                    processedBy: adminId,
                    walletTransactionId: walletTransaction.id,
                },
                { transaction: t }
            );

            await t.commit();

            logger.info(`Withdrawal request ${requestId} approved by admin ${adminId}`);
            return { request, walletTransaction };
        } catch (error) {
            await t.rollback();
            logger.error("Error approving withdrawal:", error);
            throw error;
        }
    }

    /**
     * Reject withdrawal request
     * @param {string} requestId - Request ID
     * @param {string} adminId - Admin user ID
     * @param {string} reason - Rejection reason
     * @returns {Promise<WithdrawalRequest>}
     */
    async rejectWithdrawal(requestId, adminId, reason) {
        try {
            const request = await WithdrawalRequest.findByPk(requestId);

            if (!request) {
                throw new Error("Withdrawal request not found");
            }

            if (request.status !== "pending") {
                throw new Error(`Withdrawal request is already ${request.status}`);
            }

            await request.update({
                status: "rejected",
                processedAt: new Date(),
                processedBy: adminId,
                rejectionReason: reason,
            });

            logger.info(`Withdrawal request ${requestId} rejected by admin ${adminId}`);
            return request;
        } catch (error) {
            logger.error("Error rejecting withdrawal:", error);
            throw error;
        }
    }

    /**
     * Get user's withdrawal requests
     * @param {string} userId - User ID
     * @param {object} filters - Filter options
     * @param {object} pagination - Pagination options
     * @returns {Promise<object>}
     */
    async getUserWithdrawals(userId, filters = {}, pagination = {}) {
        try {
            const { page = 1, limit = 20 } = pagination;
            const offset = (page - 1) * limit;

            const where = { userId };

            if (filters.status) {
                where.status = filters.status;
            }

            if (filters.startDate || filters.endDate) {
                where.requestedAt = {};
                if (filters.startDate) {
                    where.requestedAt[Op.gte] = new Date(filters.startDate);
                }
                if (filters.endDate) {
                    where.requestedAt[Op.lte] = new Date(filters.endDate);
                }
            }

            const requests = await WithdrawalRequest.findAndCountAll({
                where,
                order: [["requestedAt", "DESC"]],
                limit,
                offset,
                include: [
                    {
                        model: User,
                        as: "processor",
                        attributes: ["id", "name"],
                    },
                ],
            });

            return {
                requests: requests.rows,
                totalCount: requests.count,
                currentPage: page,
                totalPages: Math.ceil(requests.count / limit),
                hasMore: offset + limit < requests.count,
            };
        } catch (error) {
            logger.error("Error getting user withdrawals:", error);
            throw error;
        }
    }

    /**
     * Get pending withdrawal requests (admin)
     * @param {object} pagination - Pagination options
     * @returns {Promise<object>}
     */
    async getPendingWithdrawals(pagination = {}) {
        try {
            const { page = 1, limit = 20 } = pagination;
            const offset = (page - 1) * limit;

            const requests = await WithdrawalRequest.findAndCountAll({
                where: { status: "pending" },
                order: [["requestedAt", "ASC"]],
                limit,
                offset,
                include: [
                    {
                        model: User,
                        as: "user",
                        attributes: ["id", "name", "email", "role"],
                    },
                ],
            });

            return {
                requests: requests.rows,
                totalCount: requests.count,
                currentPage: page,
                totalPages: Math.ceil(requests.count / limit),
                hasMore: offset + limit < requests.count,
            };
        } catch (error) {
            logger.error("Error getting pending withdrawals:", error);
            throw error;
        }
    }

    /**
     * Get all withdrawal requests (admin)
     * @param {object} filters - Filter options (status, startDate, endDate)
     * @param {object} pagination - Pagination options
     * @returns {Promise<object>}
     */
    async getAllWithdrawals(filters = {}, pagination = {}) {
        try {
            const { page = 1, limit = 20 } = pagination;
            const offset = (page - 1) * limit;

            const where = {
                status: { [Op.ne]: "pending" }
            };

            // Filter by status if provided
            if (filters.status && filters.status !== "all") {
                where.status = filters.status;
            }

            // Filter by date range
            if (filters.startDate || filters.endDate) {
                where.requestedAt = {};
                if (filters.startDate) {
                    where.requestedAt[Op.gte] = new Date(filters.startDate);
                }
                if (filters.endDate) {
                    where.requestedAt[Op.lte] = new Date(filters.endDate);
                }
            }

            const requests = await WithdrawalRequest.findAndCountAll({
                where,
                order: [[filters.status === "pending" ? "requestedAt" : "processedAt", "DESC"]],
                limit,
                offset,
                include: [
                    {
                        model: User,
                        as: "user",
                        attributes: ["id", "name", "email", "role"],
                    },
                    {
                        model: User,
                        as: "processor",
                        attributes: ["id", "name"],
                    },
                ],
            });

            return {
                requests: requests.rows,
                totalCount: requests.count,
                currentPage: page,
                totalPages: Math.ceil(requests.count / limit),
                hasMore: offset + limit < requests.count,
            };
        } catch (error) {
            logger.error("Error getting all withdrawals:", error);
            throw error;
        }
    }

    /**
     * Get withdrawal statistics for a user
     * @param {string} userId - User ID
     * @returns {Promise<object>}
     */
    async getWithdrawalStats(userId) {
        try {
            const [totalRequests, approvedRequests, rejectedRequests, pendingRequests] = await Promise.all([
                WithdrawalRequest.count({ where: { userId } }),
                WithdrawalRequest.count({ where: { userId, status: "approved" } }),
                WithdrawalRequest.count({ where: { userId, status: "rejected" } }),
                WithdrawalRequest.count({ where: { userId, status: "pending" } }),
            ]);

            const totalWithdrawn = await WithdrawalRequest.sum("amount", {
                where: { userId, status: "approved" },
            });

            return {
                totalRequests,
                approvedRequests,
                rejectedRequests,
                pendingRequests,
                totalWithdrawn: parseFloat(totalWithdrawn || 0),
            };
        } catch (error) {
            logger.error("Error getting withdrawal stats:", error);
            throw error;
        }
    }
}

module.exports = new WithdrawalService();
