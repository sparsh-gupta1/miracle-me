const { IntroVideo, IntroVideoView, sequelize } = require("../models");
const s3Service = require("../services/s3.service");
const logger = require("../utils/logger");

// ─────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────

/**
 * POST /api/intro-video/upload
 * Admin uploads a new intro video.
 * Deactivates all previously active videos automatically.
 */
exports.uploadIntroVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided" });
    }

    const { title, description } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const adminId = req.user.id;
    const { file } = req;
    const folderPath = `intro-videos`;

    // Upload to S3
    const result = await s3Service.uploadFileToS3(
      file.buffer,
      file.originalname,
      folderPath,
      file.mimetype
    );

    // In a transaction: deactivate old videos, create new one
    const introVideo = await sequelize.transaction(async (t) => {
      // Deactivate all existing active intro videos
      await IntroVideo.update(
        { isActive: false },
        { where: { isActive: true }, transaction: t }
      );

      // Create new active intro video record
      return IntroVideo.create(
        {
          title,
          description: description || null,
          s3Key: result.key,
          s3Url: result.url,
          mimeType: file.mimetype,
          fileSize: file.size,
          isActive: true,
          uploadedBy: adminId,
        },
        { transaction: t }
      );
    });

    logger.info(`Intro video uploaded: ${result.key} by admin ${adminId}`);

    return res.status(201).json({
      success: true,
      message: "Intro video uploaded successfully",
      data: {
        id: introVideo.id,
        title: introVideo.title,
        description: introVideo.description,
        s3Key: introVideo.s3Key,
        s3Url: introVideo.s3Url,
        mimeType: introVideo.mimeType,
        fileSize: introVideo.fileSize,
        isActive: introVideo.isActive,
        createdAt: introVideo.createdAt,
      },
    });
  } catch (error) {
    logger.error(`Intro video upload error: ${error.message}`);
    next(error);
  }
};

/**
 * GET /api/intro-video/admin/list
 * Admin fetches all intro videos (active + inactive) with total view counts.
 */
exports.adminListIntroVideos = async (req, res, next) => {
  try {
    const videos = await IntroVideo.findAll({
      order: [["createdAt", "DESC"]],
      paranoid: false, // include soft-deleted
    });

    // Attach view counts per video
    const data = await Promise.all(
      videos.map(async (video) => {
        const totalViews = await IntroVideoView.count({
          where: { introVideoId: video.id, isViewed: true },
        });

        return {
          id: video.id,
          title: video.title,
          description: video.description,
          s3Key: video.s3Key,
          s3Url: video.s3Url,
          mimeType: video.mimeType,
          fileSize: video.fileSize,
          isActive: video.isActive,
          totalViewedBy: totalViews,
          createdAt: video.createdAt,
          deletedAt: video.deletedAt,
        };
      })
    );

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`Admin list intro videos error: ${error.message}`);
    next(error);
  }
};

/**
 * DELETE /api/intro-video/:id
 * Admin soft-deletes an intro video.
 */
exports.deleteIntroVideo = async (req, res, next) => {
  try {
    const { id } = req.params;

    const video = await IntroVideo.findByPk(id);
    if (!video) {
      return res.status(404).json({ success: false, message: "Intro video not found" });
    }

    await video.destroy(); // soft delete (paranoid: true)

    logger.info(`Intro video soft-deleted: ${id}`);

    return res.status(200).json({ success: true, message: "Intro video deleted successfully" });
  } catch (error) {
    logger.error(`Delete intro video error: ${error.message}`);
    next(error);
  }
};

// ─────────────────────────────────────────────
// USER ENDPOINTS  (role: "user" only)
// ─────────────────────────────────────────────

/**
 * GET /api/intro-video/active
 * Returns the currently active intro video along with
 * the authenticated user's isViewed status.
 */
exports.getActiveIntroVideo = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch the active intro video
    const video = await IntroVideo.findOne({
      where: { isActive: true },
      order: [["createdAt", "DESC"]],
    });

    if (!video) {
      return res.status(404).json({ success: false, message: "No active intro video found" });
    }

    // Find or initialise the user's view record
    const [viewRecord] = await IntroVideoView.findOrCreate({
      where: { introVideoId: video.id, userId },
      defaults: { isViewed: false },
    });

    // Generate a presigned S3 URL so the client can stream/download
    let presignedUrl = null;
    try {
      presignedUrl = await s3Service.getPresignedDownloadUrl(video.s3Key, 3600);
    } catch (e) {
      logger.warn(`Could not generate presigned URL for intro video ${video.id}: ${e.message}`);
      presignedUrl = video.s3Url; // fallback to stored URL
    }

    return res.status(200).json({
      success: true,
      data: {
        id: video.id,
        title: video.title,
        description: video.description,
        mimeType: video.mimeType,
        fileSize: video.fileSize,
        videoUrl: presignedUrl,
        isViewed: viewRecord.isViewed,
        viewedAt: viewRecord.viewedAt,
        createdAt: video.createdAt,
      },
    });
  } catch (error) {
    logger.error(`Get active intro video error: ${error.message}`);
    next(error);
  }
};

/**
 * POST /api/intro-video/:id/mark-viewed
 * User marks an intro video as viewed (isViewed = true).
 * Idempotent — calling it again is a no-op.
 */
exports.markAsViewed = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const video = await IntroVideo.findByPk(id);
    if (!video) {
      return res.status(404).json({ success: false, message: "Intro video not found" });
    }

    // Upsert view record
    const [viewRecord, created] = await IntroVideoView.findOrCreate({
      where: { introVideoId: id, userId },
      defaults: { isViewed: true, viewedAt: new Date() },
    });

    if (!created && !viewRecord.isViewed) {
      // Record existed but wasn't marked — update it
      await viewRecord.update({ isViewed: true, viewedAt: new Date() });
    }

    return res.status(200).json({
      success: true,
      message: "Marked as viewed",
      data: {
        introVideoId: id,
        userId,
        isViewed: true,
        viewedAt: viewRecord.viewedAt || new Date(),
      },
    });
  } catch (error) {
    logger.error(`Mark intro video as viewed error: ${error.message}`);
    next(error);
  }
};
