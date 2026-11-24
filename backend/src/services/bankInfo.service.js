const { BankInfo, User } = require("../models");
const logger = require("../utils/logger");

class BankInfoService {
    /**
     * Create or update user's bank info (Upsert)
     * @param {string} userId - User ID
     * @param {object} data - Bank account details
     * @returns {Promise<BankInfo>}
     */
    async upsertBankInfo(userId, data) {
        try {
            let bankInfo = await BankInfo.findOne({ where: { userId } });

            if (bankInfo) {
                // Update existing
                await bankInfo.update({
                    ...data,
                    isVerified: false, // Reset verification on update
                    verifiedAt: null,
                    verifiedBy: null,
                });
                logger.info(`Bank info updated for user ${userId}`);
            } else {
                // Create new
                bankInfo = await BankInfo.create({
                    userId,
                    ...data,
                    isVerified: false,
                });
                logger.info(`Bank info created for user ${userId}`);
            }

            return bankInfo;
        } catch (error) {
            logger.error("Error upserting bank info:", error);
            throw error;
        }
    }

    /**
     * Get bank info for a specific user
     * @param {string} userId - User ID
     * @returns {Promise<BankInfo|null>}
     */
    async getBankInfo(userId) {
        try {
            return await BankInfo.findOne({
                where: { userId },
                include: [
                    {
                        model: User,
                        as: "verifier",
                        attributes: ["id", "name"],
                    },
                ],
            });
        } catch (error) {
            logger.error("Error fetching bank info:", error);
            throw error;
        }
    }

    /**
     * Get all bank infos (Admin)
     * @param {object} filters - Filters like role, isVerified
     * @param {object} pagination - Pagination { page, limit }
     * @returns {Promise<object>}
     */
    async getAllBankInfos(filters = {}, pagination = {}) {
        try {
            const { page = 1, limit = 20 } = pagination;
            const offset = (page - 1) * limit;

            const where = {};
            const userWhere = {};

            if (filters.isVerified !== undefined) {
                where.isVerified = filters.isVerified === 'true' || filters.isVerified === true;
            }

            if (filters.role) {
                userWhere.role = filters.role;
            }

            const bankInfos = await BankInfo.findAndCountAll({
                where,
                limit,
                offset,
                order: [["createdAt", "DESC"]],
                include: [
                    {
                        model: User,
                        as: "user",
                        where: Object.keys(userWhere).length ? userWhere : undefined,
                        attributes: ["id", "name", "email", "mobileNumber", "role"],
                    },
                    {
                        model: User,
                        as: "verifier",
                        attributes: ["id", "name"],
                    },
                ],
            });

            return {
                data: bankInfos.rows,
                totalCount: bankInfos.count,
                currentPage: parseInt(page),
                totalPages: Math.ceil(bankInfos.count / limit),
                hasMore: offset + limit < bankInfos.count,
            };
        } catch (error) {
            logger.error("Error fetching all bank infos:", error);
            throw error;
        }
    }

    /**
     * Verify a user's bank info (Admin)
     * @param {string} userId - Target user ID
     * @param {string} adminId - Admin who is verifying
     * @returns {Promise<BankInfo>}
     */
    async verifyBankInfo(userId, adminId) {
        try {
            const bankInfo = await BankInfo.findOne({ where: { userId } });

            if (!bankInfo) {
                throw new Error("Bank info not found for this user");
            }

            if (bankInfo.isVerified) {
                throw new Error("Bank info is already verified");
            }

            await bankInfo.update({
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: adminId,
            });

            logger.info(`Bank info for user ${userId} verified by admin ${adminId}`);
            return bankInfo;
        } catch (error) {
            logger.error("Error verifying bank info:", error);
            throw error;
        }
    }
}

module.exports = new BankInfoService();
