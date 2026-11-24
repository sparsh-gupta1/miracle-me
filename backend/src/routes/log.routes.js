const express = require("express");
const router = express.Router();
const logController = require("../controllers/log.controller");
const {
    authenticate,
    requireAdmin,
} = require("../middlewares/auth.middleware");
const { validateQuery } = require("../middlewares/validation.middleware");
const {
    logReadQuerySchema,
    logFollowQuerySchema,
    logCleanupQuerySchema,
} = require("../utils/validation-schemas");

// Server logs are admin only.
router.use(authenticate, requireAdmin);

/**
 * @route   GET /api/logs
 * @desc    List log files (name, size, modifiedAt)
 * @access  Admin
 */
router.get("/", logController.listFiles);

/**
 * @route   GET /api/logs/:file?limit=&cursor=&level=&search=
 * @desc    Read entries newest first; pass the returned nextCursor as `cursor` for older entries
 * @access  Admin
 */
router.get("/:file", validateQuery(logReadQuerySchema), logController.readEntries);

/**
 * @route   GET /api/logs/:file/follow?after=&level=&search=
 * @desc    Entries written after byte offset `after` (use endCursor from the previous response)
 * @access  Admin
 */
router.get("/:file/follow", validateQuery(logFollowQuerySchema), logController.followEntries);

/**
 * @route   GET /api/logs/:file/download
 * @desc    Download the whole log file
 * @access  Admin
 */
router.get("/:file/download", logController.downloadFile);

/**
 * @route   DELETE /api/logs?olderThanDays=14
 * @desc    Delete all inactive log files older than N days
 * @access  Admin
 */
router.delete("/", validateQuery(logCleanupQuerySchema), logController.deleteOlderThan);

/**
 * @route   DELETE /api/logs/:file
 * @desc    Delete one log file (409 for the file currently being written; clear it instead)
 * @access  Admin
 */
router.delete("/:file", logController.deleteFile);

/**
 * @route   POST /api/logs/:file/clear
 * @desc    Empty a log file, including the one currently being written
 * @access  Admin
 */
router.post("/:file/clear", logController.clearFile);

module.exports = router;
