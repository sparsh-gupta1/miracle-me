const express = require("express");
const { uploadSingleFile, uploadMultipleFiles } = require("../config/multer");
const documentController = require("../controllers/document.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

// Protect all routes with authentication
// router.use(authMiddleware);

/**
 * @route   POST /api/documents/upload
 * @desc    Upload a single document
 * @access  Private
 * @param   file - Document file
 * @returns Document metadata with S3 key and URL
 */
router.post("/upload", uploadSingleFile, documentController.uploadDocument);

/**
 * @route   POST /api/documents/upload-multiple
 * @desc    Upload multiple documents
 * @access  Private
 * @param   files - Array of document files (max 5)
 * @returns Array of uploaded document metadata
 */
router.post(
  "/upload-multiple",
  uploadMultipleFiles,
  documentController.uploadMultipleDocuments
);

/**
 * @route   GET /api/documents
 * @desc    Get all documents for the authenticated user
 * @access  Private
 * @returns Array of user's documents
 */
router.get("/", documentController.getDocuments);

/**
 * @route   GET /api/documents/download/:key
 * @desc    Get presigned download URL for document
 * @access  Private
 * @param   key - Document S3 key (URL encoded)
 * @returns Presigned S3 download URL
 */
router.get(/^\/download\/(.+)$/, documentController.getDownloadUrl);

/**
 * @route   GET /api/documents/:key
 * @desc    Get a specific document (supports S3 keys with slashes)
 * @access  Private
 * @param   key - Document S3 key (URL encoded)
 * @returns Document details
 */
router.get(/^\/(.+)$/, documentController.getDocumentById);

/**
 * @route   DELETE /api/documents/:key
 * @desc    Delete a document (supports S3 keys with slashes)
 * @access  Private
 * @param   key - Document S3 key (URL encoded)
 * @returns Success message
 */
router.delete(/^\/(.+)$/, documentController.deleteDocument);

module.exports = router;
