const { Op } = require("sequelize");
const { Announcement, User } = require("../models");
const logger = require("../utils/logger");

const ALL_TARGET_ROLES = ["user", "listener", "astrologer"];

class AnnouncementService {
    /**
     * Create a new announcement
     * @param {object} data - { message, targetRoles }
     * @param {string} adminId - Admin user ID
     * @returns {Promise<Announcement>}
     */
    async createAnnouncement(data, adminId) {
        try {
            const announcement = await Announcement.create({
                message: data.message,
                targetRoles: data.targetRoles || ALL_TARGET_ROLES,
                createdBy: adminId,
                isActive: true,
            });

            logger.info(`Announcement created by admin ${adminId}`);
            return announcement;
        } catch (error) {
            logger.error("Error creating announcement:", error);
            throw error;
        }
    }

    /**
     * Get active announcements targeted at the caller's role (user-facing).
     * Admins see all active announcements regardless of targeting.
     * Soft-deleted rows are auto-excluded by paranoid mode.
     * @param {object} options - { page, limit, role }
     * @returns {Promise<{ announcements: Array, totalCount: number, hasMore: boolean }>}
     */
    async getAnnouncements({ page = 1, limit = 20, role } = {}) {
        try {
            const offset = (page - 1) * limit;

            const where = { isActive: true };
            if (ALL_TARGET_ROLES.includes(role)) {
                where.targetRoles = { [Op.contains]: [role] };
            }

            const result = await Announcement.findAndCountAll({
                where,
                order: [["createdAt", "DESC"]],
                limit,
                offset,
            });

            return {
                announcements: result.rows,
                totalCount: result.count,
                hasMore: offset + limit < result.count,
            };
        } catch (error) {
            logger.error("Error getting announcements:", error);
            throw error;
        }
    }

    /**
     * Get all non-deleted announcements incl. inactive (admin management).
     * @param {object} options - { page, limit }
     * @returns {Promise<{ announcements: Array, totalCount: number, hasMore: boolean }>}
     */
    async getAllAnnouncements({ page = 1, limit = 20 } = {}) {
        try {
            const offset = (page - 1) * limit;

            const result = await Announcement.findAndCountAll({
                order: [["createdAt", "DESC"]],
                limit,
                offset,
                include: [
                    {
                        model: User,
                        as: "creator",
                        attributes: ["id", "name", "email"],
                    },
                ],
            });

            return {
                announcements: result.rows,
                totalCount: result.count,
                hasMore: offset + limit < result.count,
            };
        } catch (error) {
            logger.error("Error getting all announcements:", error);
            throw error;
        }
    }

    /**
     * Update an announcement (text and/or active toggle)
     * @param {string} id - Announcement ID
     * @param {object} data - { message, isActive, targetRoles }
     * @returns {Promise<Announcement>}
     */
    async updateAnnouncement(id, data) {
        try {
            const announcement = await Announcement.findByPk(id);
            if (!announcement) {
                const error = new Error("Announcement not found");
                error.name = "NotFoundError";
                throw error;
            }

            await announcement.update({
                message: data.message !== undefined ? data.message : announcement.message,
                isActive: data.isActive !== undefined ? data.isActive : announcement.isActive,
                targetRoles: data.targetRoles !== undefined ? data.targetRoles : announcement.targetRoles,
            });

            logger.info(`Announcement ${id} updated`);
            return announcement;
        } catch (error) {
            logger.error("Error updating announcement:", error);
            throw error;
        }
    }

    /**
     * Soft delete an announcement (paranoid: sets deleted_at)
     * @param {string} id - Announcement ID
     * @returns {Promise<void>}
     */
    async deleteAnnouncement(id) {
        try {
            const announcement = await Announcement.findByPk(id);
            if (!announcement) {
                const error = new Error("Announcement not found");
                error.name = "NotFoundError";
                throw error;
            }

            await announcement.destroy();
            logger.info(`Announcement ${id} soft-deleted`);
        } catch (error) {
            logger.error("Error deleting announcement:", error);
            throw error;
        }
    }
}

module.exports = new AnnouncementService();
