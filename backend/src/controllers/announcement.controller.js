const announcementService = require("../services/announcement.service");

/**
 * Create a new announcement (admin)
 */
const createAnnouncement = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const { message, targetRoles } = req.body;

        const announcement = await announcementService.createAnnouncement(
            { message, targetRoles },
            adminId
        );

        res.status(201).json({
            success: true,
            message: "Announcement created successfully",
            data: announcement,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get active announcements (all authenticated users)
 */
const getAnnouncements = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        const result = await announcementService.getAnnouncements({
            page,
            limit,
            role: req.user.role,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all announcements incl. inactive (admin management)
 */
const getAllAnnouncements = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        const result = await announcementService.getAllAnnouncements({ page, limit });

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update an announcement (admin)
 */
const updateAnnouncement = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { message, isActive, targetRoles } = req.body;

        const announcement = await announcementService.updateAnnouncement(id, {
            message,
            isActive,
            targetRoles,
        });

        res.status(200).json({
            success: true,
            message: "Announcement updated successfully",
            data: announcement,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Soft delete an announcement (admin)
 */
const deleteAnnouncement = async (req, res, next) => {
    try {
        const { id } = req.params;

        await announcementService.deleteAnnouncement(id);

        res.status(200).json({
            success: true,
            message: "Announcement deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createAnnouncement,
    getAnnouncements,
    getAllAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
};
