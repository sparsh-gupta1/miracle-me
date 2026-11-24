const express = require("express");
const router = express.Router();
const multer = require("multer");
const introVideoController = require("../controllers/introVideo.controller");
const {
  authenticate,
  requireAdmin,
  requireRoles,
} = require("../middlewares/auth.middleware");

// ── Multer for video / document uploads (50 MB limit) ──────────────────────
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      // Videos
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
      // Also allow common document types
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed for intro video`), false);
    }
  },
});

// Apply authentication to all routes
router.use(authenticate);

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

/**
 * @route   POST /api/intro-video/upload
 * @desc    Admin uploads a new intro video (deactivates previous active video)
 * @access  Admin
 * @body    file (multipart), title (string), description? (string)
 */
router.post(
  "/upload",
  requireAdmin,
  videoUpload.single("file"),
  introVideoController.uploadIntroVideo
);

/**
 * @route   GET /api/intro-video/admin/list
 * @desc    Admin lists all intro videos with view counts
 * @access  Admin
 */
router.get("/admin/list", requireAdmin, introVideoController.adminListIntroVideos);

/**
 * @route   DELETE /api/intro-video/:id
 * @desc    Admin soft-deletes an intro video
 * @access  Admin
 */
router.delete("/:id", requireAdmin, introVideoController.deleteIntroVideo);

// ─── USER ROUTES ─────────────────────────────────────────────────────────────

/**
 * @route   GET /api/intro-video/active
 * @desc    Get the currently active intro video + user's isViewed status
 * @access  User (role: user)
 */
router.get(
  "/active",
  requireRoles(["user"]),
  introVideoController.getActiveIntroVideo
);

/**
 * @route   POST /api/intro-video/:id/mark-viewed
 * @desc    User marks an intro video as viewed (isViewed = true)
 * @access  User (role: user)
 */
router.post(
  "/:id/mark-viewed",
  requireRoles(["user"]),
  introVideoController.markAsViewed
);

module.exports = router;
