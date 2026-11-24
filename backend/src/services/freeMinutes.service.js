const {
    FreeMinutesConfig,
    UserFreeMinutesUsage,
    User,
    sequelize,
} = require("../models");
const logger = require("../utils/logger");
const { Op } = require("sequelize");

const ALL_SERVICE_TYPES = ["chat", "audio_call", "video_call"];

class FreeMinutesService {
    /**
     * Get active free minutes configuration for a service type
     * @param {string} serviceType - Service type (chat, audio_call, video_call)
     * @returns {Promise<FreeMinutesConfig|null>}
     */
    async getFreeMinutesConfig(serviceType) {
        try {
            return await FreeMinutesConfig.findOne({
                where: {
                    service_type: serviceType,
                    is_active: true,
                },
            });
        } catch (error) {
            logger.error("Error getting free minutes config:", error);
            throw error;
        }
    }

    /**
     * Get all active free minutes configurations
     * @returns {Promise<Array<FreeMinutesConfig>>}
     */
    async getAllFreeMinutesConfigs() {
        try {
            return await FreeMinutesConfig.findAll({
                where: { is_active: true },
                order: [["service_type", "ASC"]],
            });
        } catch (error) {
            logger.error("Error getting all free minutes configs:", error);
            throw error;
        }
    }

    /**
     * Create or update free minutes configuration (Admin only)
     * Syncs free minutes limit across services to maintain unified shared pool limit.
     * @param {string} serviceType - Service type
     * @param {number} freeMinutes - Number of free minutes
     * @param {string} adminId - Admin user ID
     * @returns {Promise<FreeMinutesConfig>}
     */
    async setFreeMinutesConfig(serviceType, freeMinutes, adminId) {
        try {
            const [config, created] = await FreeMinutesConfig.findOrCreate({
                where: { service_type: serviceType },
                defaults: {
                    service_type: serviceType,
                    free_minutes: freeMinutes,
                    is_active: true,
                    created_by: adminId,
                },
            });

            if (!created) {
                await config.update({
                    free_minutes: freeMinutes,
                    is_active: true,
                });
            }

            // Sync all user total_free_seconds and remaining_seconds based on total consumed
            const newTotalFreeSeconds = freeMinutes * 60;
            const userUsages = await UserFreeMinutesUsage.findAll();
            const userIds = [...new Set(userUsages.map((u) => u.user_id))];

            for (const uId of userIds) {
                await this.syncUserRemainingSeconds(uId, newTotalFreeSeconds);
            }

            logger.info(
                `Free minutes config ${created ? "created" : "updated"} for ${serviceType}: ${freeMinutes} minutes`
            );

            return config;
        } catch (error) {
            logger.error("Error setting free minutes config:", error);
            throw error;
        }
    }

    /**
     * Helper to compute total consumed free seconds across all services for a user
     * @param {string} userId - User ID
     * @param {object} [transaction=null] - Sequelize transaction
     * @returns {Promise<{totalConsumedSeconds: number, usages: Array<UserFreeMinutesUsage>}>}
     */
    async getUserGlobalConsumedSeconds(userId, transaction = null) {
        const usages = await UserFreeMinutesUsage.findAll({
            where: { user_id: userId },
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : undefined,
        });

        const totalConsumedSeconds = usages.reduce(
            (sum, u) => sum + (u.consumed_seconds || 0),
            0
        );

        return { totalConsumedSeconds, usages };
    }

    /**
     * Get global total free seconds configured for a user and service type
     * @param {string} userId - User ID
     * @param {string} serviceType - Service type
     * @param {object} [transaction=null] - Transaction
     * @returns {Promise<number>} - Total free seconds
     */
    async getGlobalFreeSeconds(userId = null, serviceType = "chat", transaction = null) {
        if (userId) {
            const usage = await UserFreeMinutesUsage.findOne({
                where: { user_id: userId, service_type: serviceType },
                transaction,
            }) || await UserFreeMinutesUsage.findOne({
                where: { user_id: userId },
                transaction,
            });

            if (usage && usage.total_free_seconds !== undefined && usage.total_free_seconds !== null) {
                return usage.total_free_seconds;
            }
        }

        const config = await this.getFreeMinutesConfig(serviceType);
        if (config && config.is_active) {
            return config.free_minutes * 60;
        }

        // Check if any active config exists across any service
        const allConfigs = await this.getAllFreeMinutesConfigs();
        if (allConfigs && allConfigs.length > 0) {
            return allConfigs[0].free_minutes * 60;
        }

        return 0;
    }

    /**
     * Sync user's remaining free seconds across all usage rows based on shared pool total
     * @param {string} userId - User ID
     * @param {number} [customTotalFreeSeconds=null] - Optional override total free seconds
     * @param {object} [transaction=null] - Sequelize transaction
     */
    async syncUserRemainingSeconds(userId, customTotalFreeSeconds = null, transaction = null) {
        const { totalConsumedSeconds, usages } = await this.getUserGlobalConsumedSeconds(
            userId,
            transaction
        );

        const totalFreeSeconds = customTotalFreeSeconds !== null
            ? customTotalFreeSeconds
            : await this.getGlobalFreeSeconds(userId, "chat", transaction);

        const remainingSeconds = Math.max(0, totalFreeSeconds - totalConsumedSeconds);

        for (const usage of usages) {
            await usage.update(
                {
                    total_free_seconds: totalFreeSeconds,
                    remaining_seconds: remainingSeconds,
                },
                { transaction }
            );
        }

        return { totalFreeSeconds, totalConsumedSeconds, remainingSeconds };
    }

    /**
     * Initialize or update user's free minutes for a service type
     * @param {string} userId - User ID
     * @param {string} serviceType - Service type
     * @returns {Promise<UserFreeMinutesUsage|null>}
     */
    async initializeUserFreeMinutes(userId, serviceType) {
        try {
            const totalFreeSeconds = await this.getGlobalFreeSeconds(userId, serviceType);

            if (totalFreeSeconds <= 0) {
                logger.info(`No active free minutes config for ${serviceType}, skipping initialization`);
                return null;
            }

            const { totalConsumedSeconds } = await this.getUserGlobalConsumedSeconds(userId);
            const remainingSeconds = Math.max(0, totalFreeSeconds - totalConsumedSeconds);

            const [usage, created] = await UserFreeMinutesUsage.findOrCreate({
                where: {
                    user_id: userId,
                    service_type: serviceType,
                },
                defaults: {
                    user_id: userId,
                    service_type: serviceType,
                    total_free_seconds: totalFreeSeconds,
                    consumed_seconds: 0,
                    remaining_seconds: remainingSeconds,
                },
            });

            if (!created) {
                await usage.update({
                    total_free_seconds: totalFreeSeconds,
                    remaining_seconds: remainingSeconds,
                });
            }

            return usage;
        } catch (error) {
            logger.error("Error initializing user free minutes:", error);
            throw error;
        }
    }

    /**
     * Get user's remaining free seconds without making any updates (read-only)
     * @param {string} userId - User ID
     * @param {string} serviceType - Service type
     * @returns {Promise<number>} - Remaining free seconds
     */
    async getUserFreeSecondsRemaining(userId, serviceType) {
        try {
            const totalFreeSeconds = await this.getGlobalFreeSeconds(userId, serviceType);
            if (totalFreeSeconds <= 0) {
                return 0;
            }

            const { totalConsumedSeconds } = await this.getUserGlobalConsumedSeconds(userId);
            return Math.max(0, totalFreeSeconds - totalConsumedSeconds);
        } catch (error) {
            logger.error("Error getting read-only user free seconds remaining:", error);
            throw error;
        }
    }

    /**
     * Get user's free minutes usage for a service type (with shared pool calculation)
     * @param {string} userId - User ID
     * @param {string} serviceType - Service type
     * @returns {Promise<UserFreeMinutesUsage|null>}
     */
    async getUserFreeMinutesUsage(userId, serviceType) {
        try {
            let usage = await UserFreeMinutesUsage.findOne({
                where: {
                    user_id: userId,
                    service_type: serviceType,
                },
            });

            // Auto-initialize if not exists
            if (!usage) {
                usage = await this.initializeUserFreeMinutes(userId, serviceType);
            }

            if (!usage) {
                return null;
            }

            // Always calculate up-to-date remaining seconds based on shared total consumption across all services
            const totalFreeSeconds = await this.getGlobalFreeSeconds(userId, serviceType);
            const { totalConsumedSeconds } = await this.getUserGlobalConsumedSeconds(userId);
            const remainingSeconds = Math.max(0, totalFreeSeconds - totalConsumedSeconds);

            if (usage.remaining_seconds !== remainingSeconds || usage.total_free_seconds !== totalFreeSeconds) {
                await usage.update({
                    total_free_seconds: totalFreeSeconds,
                    remaining_seconds: remainingSeconds,
                });
            }

            return usage;
        } catch (error) {
            logger.error("Error getting user free minutes usage:", error);
            throw error;
        }
    }

    /**
     * Get all user's free minutes usage across all service types (reflecting shared pool)
     * @param {string} userId - User ID
     * @returns {Promise<Array<object>>}
     */
    async getAllUserFreeMinutesUsage(userId) {
        try {
            let configs = await this.getAllFreeMinutesConfigs();
            if (!configs || configs.length === 0) {
                configs = ALL_SERVICE_TYPES.map((st) => ({
                    service_type: st,
                    free_minutes: 1,
                    is_active: true,
                }));
            }

            const { totalConsumedSeconds } = await this.getUserGlobalConsumedSeconds(userId);
            const usageData = [];

            for (const config of configs) {
                let usage = await this.getUserFreeMinutesUsage(userId, config.service_type);

                if (usage) {
                    const totalFreeSeconds = usage.total_free_seconds;
                    const remainingSeconds = Math.max(0, totalFreeSeconds - totalConsumedSeconds);

                    usageData.push({
                        serviceType: config.service_type,
                        totalFreeMinutes: Math.floor(totalFreeSeconds / 60),
                        totalFreeSeconds: totalFreeSeconds,
                        consumedMinutes: Math.floor(usage.consumed_seconds / 60),
                        consumedSeconds: usage.consumed_seconds,
                        totalGlobalConsumedSeconds: totalConsumedSeconds,
                        remainingMinutes: Math.floor(remainingSeconds / 60),
                        remainingSeconds: remainingSeconds,
                    });
                }
            }

            return usageData;
        } catch (error) {
            logger.error("Error getting all user free minutes usage:", error);
            throw error;
        }
    }

    /**
     * Consume free minutes for a conversation from the unified shared pool
     * @param {string} userId - User ID
     * @param {string} serviceType - Service type
     * @param {number} durationSeconds - Duration to consume in seconds
     * @param {object} transaction - Sequelize transaction
     * @returns {Promise<object>} - { consumedFreeSeconds, remainingFreeSeconds, billableSeconds }
     */
    async consumeFreeMinutes(userId, serviceType, durationSeconds, transaction = null) {
        try {
            const totalFreeSeconds = await this.getGlobalFreeSeconds(userId, serviceType, transaction);

            if (totalFreeSeconds <= 0) {
                return {
                    consumedFreeSeconds: 0,
                    remainingFreeSeconds: 0,
                    billableSeconds: durationSeconds,
                };
            }

            // Ensure record for this service exists
            let usage = await UserFreeMinutesUsage.findOne({
                where: {
                    user_id: userId,
                    service_type: serviceType,
                },
                transaction,
                lock: transaction ? transaction.LOCK.UPDATE : undefined,
            });

            if (!usage) {
                usage = await UserFreeMinutesUsage.create(
                    {
                        user_id: userId,
                        service_type: serviceType,
                        total_free_seconds: totalFreeSeconds,
                        consumed_seconds: 0,
                        remaining_seconds: totalFreeSeconds,
                    },
                    { transaction }
                );
            }

            const { totalConsumedSeconds } = await this.getUserGlobalConsumedSeconds(userId, transaction);
            const availableFreeSeconds = Math.max(0, totalFreeSeconds - totalConsumedSeconds);

            if (availableFreeSeconds <= 0) {
                return {
                    consumedFreeSeconds: 0,
                    remainingFreeSeconds: 0,
                    billableSeconds: durationSeconds,
                };
            }

            const consumedFreeSeconds = Math.min(durationSeconds, availableFreeSeconds);
            const billableSeconds = Math.max(0, durationSeconds - availableFreeSeconds);

            await usage.update(
                {
                    consumed_seconds: usage.consumed_seconds + consumedFreeSeconds,
                },
                { transaction }
            );

            // Sync remaining seconds across all service usage rows for this user
            const newTotalConsumed = totalConsumedSeconds + consumedFreeSeconds;
            const remainingFreeSeconds = Math.max(0, totalFreeSeconds - newTotalConsumed);

            await this.syncUserRemainingSeconds(userId, totalFreeSeconds, transaction);

            logger.info(
                `User ${userId} consumed ${consumedFreeSeconds}s free time for ${serviceType} from shared pool. ` +
                `Remaining shared free seconds: ${remainingFreeSeconds}s, Billable: ${billableSeconds}s`
            );

            return {
                consumedFreeSeconds,
                remainingFreeSeconds,
                billableSeconds,
            };
        } catch (error) {
            logger.error("Error consuming free minutes:", error);
            throw error;
        }
    }

    /**
     * Disable free minutes for a service type
     * @param {string} serviceType - Service type
     * @returns {Promise<boolean>}
     */
    async disableFreeMinutes(serviceType) {
        try {
            const config = await FreeMinutesConfig.findOne({
                where: { service_type: serviceType },
            });

            if (config) {
                await config.update({ is_active: false });
                logger.info(`Free minutes disabled for ${serviceType}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error("Error disabling free minutes:", error);
            throw error;
        }
    }
}

module.exports = new FreeMinutesService();

