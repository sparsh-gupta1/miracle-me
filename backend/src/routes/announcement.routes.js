const express = require("express");
const router = express.Router();
const announcementController = require("../controllers/announcement.controller");
const {
    authenticate,
    requireAdmin,
} = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validation.middleware");
const {
    createAnnouncementSchema,
    updateAnnouncementSchema,
} = require("../utils/validation-schemas");

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   POST /api/announcements
 * @desc    Create a new announcement
 * @access  Admin
 */
router.post(
    "/",
    requireAdmin,
    validate(createAnnouncementSchema),
    announcementController.createAnnouncement
);

/**
 * @route   GET /api/announcements
 * @desc    Get active announcements
 * @access  Any authenticated user
 */
router.get("/", announcementController.getAnnouncements);

/**
 * @route   GET /api/announcements/manage
 * @desc    Get all announcements including inactive (non-deleted)
 * @access  Admin
 */
router.get("/manage", requireAdmin, announcementController.getAllAnnouncements);

/**
 * @route   PUT /api/announcements/:id
 * @desc    Update an announcement (text and/or active toggle)
 * @access  Admin
 */
router.put(
    "/:id",
    requireAdmin,
    validate(updateAnnouncementSchema),
    announcementController.updateAnnouncement
);

/**
 * @route   DELETE /api/announcements/:id
 * @desc    Soft delete an announcement
 * @access  Admin
 */
router.delete("/:id", requireAdmin, announcementController.deleteAnnouncement);

module.exports = router;
