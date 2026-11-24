const { Commission, User } = require("../models");
const { Op } = require("sequelize");
const logger = require("../utils/logger");

class CommissionService {
    /**
     * Create a new commission rule
     * @param {object} data - { role, serviceType, commissionPercentage, effectiveFrom }
     * @param {string} adminId - Admin user ID
     * @returns {Promise<Commission>}
     */
    async createCommissionRule(data, adminId) {
        try {
            const effectiveDate = data.effectiveFrom ? new Date(data.effectiveFrom) : new Date();

            const commission = await Commission.create({
                role: data.role,
                serviceType: data.serviceType,
                commissionPercentage: data.commissionPercentage,
                effectiveFrom: effectiveDate,
                createdBy: adminId,
                isActive: true,
            });

            logger.info(`Commission rule created for ${data.role} - ${data.serviceType}`);
            return commission;
        } catch (error) {
            logger.error("Error creating commission rule:", error);
            throw error;
        }
    }

    /**
     * Update commission rule
     * @param {string} ruleId - Commission rule ID
     * @param {object} data - Update data
     * @returns {Promise<Commission>}
     */
    async updateCommissionRule(ruleId, data) {
        try {
            const commission = await Commission.findByPk(ruleId);
            if (!commission) {
                throw new Error("Commission rule not found");
            }

            await commission.update({
                commissionPercentage: data.commissionPercentage !== undefined
                    ? data.commissionPercentage
                    : commission.commissionPercentage,
                isActive: data.isActive !== undefined ? data.isActive : commission.isActive,
            });

            logger.info(`Commission rule ${ruleId} updated`);
            return commission;
        } catch (error) {
            logger.error("Error updating commission rule:", error);
            throw error;
        }
    }

    /**
     * Get commission rules history
     * @param {string} role - User role
     * @param {string} serviceType - Service type
     * @returns {Promise<Array<Commission>>}
     */
    async getCommissionRules(role, serviceType) {
        try {
            const where = {};
            if (role) where.role = role;
            if (serviceType) where.serviceType = serviceType;

            return await Commission.findAll({
                where,
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
            logger.error("Error getting commission rules:", error);
            throw error;
        }
    }

    /**
     * Get current active commission rate
     * @param {string} role - User role
     * @param {string} serviceType - Service type
     * @returns {Promise<Commission|null>}
     */
    async getCurrentCommission(role, serviceType) {
        try {
            return await Commission.findOne({
                where: {
                    role,
                    serviceType,
                    isActive: true,
                    effectiveFrom: { [Op.lte]: new Date() },
                },
                order: [["effectiveFrom", "DESC"]],
            });
        } catch (error) {
            logger.error("Error getting current commission:", error);
            throw error;
        }
    }

    /**
     * Calculate commission amount
     * @param {number} grossAmount - Gross amount
     * @param {string} role - User role
     * @param {string} serviceType - Service type
     * @returns {Promise<object>} - { commissionPercentage, commissionAmount, netEarning }
     */
    async calculateCommission(grossAmount, role, serviceType) {
        try {
            const commission = await this.getCurrentCommission(role, serviceType);

            if (!commission) {
                // Default: no commission if not configured
                return {
                    commissionPercentage: 0,
                    commissionAmount: 0,
                    netEarning: parseFloat(grossAmount),
                };
            }

            const commissionPercentage = parseFloat(commission.commissionPercentage);
            const gross = parseFloat(grossAmount);
            const commissionAmount = (gross * commissionPercentage) / 100;
            const netEarning = gross - commissionAmount;

            return {
                commissionPercentage,
                commissionAmount: parseFloat(commissionAmount.toFixed(2)),
                netEarning: parseFloat(netEarning.toFixed(2)),
            };
        } catch (error) {
            logger.error("Error calculating commission:", error);
            throw error;
        }
    }

    /**
     * Get all current active commission rates
     * @returns {Promise<Array<Commission>>}
     */
    async getAllCurrentCommissions() {
        try {
            return await Commission.findAll({
                where: { isActive: true },
                order: [["role", "ASC"], ["serviceType", "ASC"]],
            });
        } catch (error) {
            logger.error("Error getting all current commissions:", error);
            throw error;
        }
    }
}

module.exports = new CommissionService();
