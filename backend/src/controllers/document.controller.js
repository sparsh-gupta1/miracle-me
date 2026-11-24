const s3Service = require("../services/s3.service");
const logger = require("../utils/logger");
const { fileTypes } = require("../utils/CONSTANT");

/**
 * Upload a single document
 */
exports.uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file provided",
      });
    }

    const { file } = req;
    const userId = req.user?.id;
    const { fileType } = req.body;

    // Validate file type if provided
    let folderPath = `documents`;
    if (fileType && fileTypes[fileType]) {
      folderPath = `${fileTypes[fileType]}/${userId || ""}`;
    } else if (userId) {
      folderPath = `documents/${userId}`;
    }

    // Upload to S3
    const result = await s3Service.uploadFileToS3(
      file.buffer,
      file.originalname,
      folderPath,
      file.mimetype,
    );

    logger.info(`Document uploaded: ${result.key}`);

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      file: {
        key: result.key,
        url: result.url,
        filename: result.filename,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error(`Document upload error: ${error.message}`);
    next(error);
  }
};

/**
 * Upload multiple documents
 */
exports.uploadMultipleDocuments = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files provided",
      });
    }

    const userId = req.user?.id;
    const { fileType } = req.body;

    // Determine folder path
    let folderPath = `documents`;
    if (fileType && fileTypes[fileType]) {
      folderPath = `${fileTypes[fileType]}/${userId || ""}`;
    } else if (userId) {
      folderPath = `documents/${userId}`;
    }

    const uploadPromises = [];

    // Upload each file to S3
    for (const file of req.files) {
      const uploadPromise = s3Service.uploadFileToS3(
        file.buffer,
        file.originalname,
        folderPath,
        file.mimetype,
      );
      uploadPromises.push(uploadPromise);
    }

    const results = await Promise.all(uploadPromises);

    logger.info(`${results.length} documents uploaded`);

    return res.status(201).json({
      success: true,
      message: `${results.length} documents uploaded successfully`,
      files: results.map((result, index) => ({
        key: result.key,
        url: result.url,
        filename: result.filename,
        size: req.files[index].size,
        mimetype: req.files[index].mimetype,
        uploadedAt: new Date(),
      })),
    });
  } catch (error) {
    logger.error(`Multiple documents upload error: ${error.message}`);
    next(error);
  }
};

/**
 * Get all documents (legacy compatibility)
 */
exports.getDocuments = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const folderPath = userId ? `documents/${userId}` : "documents";

    // List files from S3
    const files = await s3Service.listFilesInFolder(folderPath);

    return res.status(200).json({
      success: true,
      data: files.map((file) => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified,
      })),
    });
  } catch (error) {
    logger.error(`Get documents error: ${error.message}`);
    next(error);
  }
};

/**
 * Get specific document by ID/key
 */
exports.getDocumentById = async (req, res, next) => {
  try {
    // Extract key from regex route match
    const fullKey = decodeURIComponent(req.params[0]);

    const userId = req.user?.id;

    // Verify the document belongs to the user (basic security check)
    if (userId && !fullKey.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get presigned download URL
    const url = await s3Service.getPresignedDownloadUrl(fullKey, 3600);

    return res.status(200).json({
      success: true,
      data: {
        key: fullKey,
        downloadUrl: url,
      },
    });
  } catch (error) {
    logger.error(`Get document error: ${error.message}`);
    next(error);
  }
};

/**
 * Delete a document
 */
exports.deleteDocument = async (req, res, next) => {
  try {
    // Extract key from regex route match
    const fullKey = decodeURIComponent(req.params[0]);

    const userId = req.user?.id;

    // Verify the document belongs to the user
    if (userId && !fullKey.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Delete from S3
    await s3Service.deleteFileFromS3(fullKey);

    logger.info(`Document deleted: ${fullKey}`);

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    logger.error(`Delete document error: ${error.message}`);
    next(error);
  }
};

/**
 * Get presigned download URL for document
 */
exports.getDownloadUrl = async (req, res, next) => {
  try {
    // Extract key from regex route match (after /download/)
    const fullKey = decodeURIComponent(req.params[0]);

    const userId = req.user?.id;

    // Verify the document belongs to the user
    if (userId && !fullKey.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Get presigned download URL (valid for 1 hour)
    const url = await s3Service.getPresignedDownloadUrl(fullKey, 3600);

    return res.status(200).json({
      success: true,
      downloadUrl: url,
      expiresIn: 3600, // seconds
    });
  } catch (error) {
    logger.error(`Get download URL error: ${error.message}`);
    next(error);
  }
};

/**
 * Legacy addDocument function for backward compatibility
 */
exports.addDocument = async (req, res, next) => {
  try {
    const { fileType } = req.body;
    const { file } = req;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const Type = fileTypes[fileType]; // Validate file type
    if (!Type) {
      return res.status(400).json({ error: "Invalid file type" });
    }

    const fileName = file.originalname;
    const folderPath = `${Type}/${fileName}`;
    const contentType = file.mimetype;
    const fileBuffer = file.buffer;

    const result = await s3Service.uploadFileToS3(
      fileBuffer,
      fileName,
      folderPath,
      contentType,
    );

    res.status(201).json({
      message: "Document added successfully",
      file: result,
    });
  } catch (error) {
    next(error);
  }
};
