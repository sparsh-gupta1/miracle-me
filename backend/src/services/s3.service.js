const {
  s3Config,
  generatePresignedUrl,
  generateDownloadUrl,
  uploadFile,
  deleteFile,
  listFiles,
  getObject,
  headObject,
} = require("../config/aws");
const logger = require("../utils/logger");

class S3Service {
  /**
   * Upload a file to S3
   * @param {Buffer} fileBuffer - File buffer to upload
   * @param {string} filename - Original filename
   * @param {string} folder - Folder path in S3 (e.g., 'avatars', 'documents')
   * @param {string} contentType - MIME type of the file
   * @returns {Promise<Object>} Upload result with key and URL
   */
  async uploadFileToS3(fileBuffer, filename, folder, contentType) {
    try {
      const timestamp = Date.now();
      const key = `${folder}/${timestamp}-${filename}`;

      const result = await uploadFile(fileBuffer, key, contentType);

      logger.info(`File uploaded successfully: ${key}`);
      return {
        success: true,
        key: result.key,
        url: result.url,
        filename: filename,
      };
    } catch (error) {
      logger.error(`S3 upload error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload a Readable stream to S3
   * @param {Readable} stream - Readable stream
   * @param {string} filename - Original filename
   * @param {string} folder - Folder path in S3
   * @param {string} contentType - MIME type
   */
  async uploadStreamToS3(stream, filename, folder, contentType = 'application/octet-stream') {
    try {
      const timestamp = Date.now();
      const key = `${folder}/${timestamp}-${filename}`;

      const result = await uploadFile(stream, key, contentType);

      logger.info(`Stream uploaded successfully: ${key}`);
      return {
        success: true,
        key: result.key,
        url: result.url,
        filename,
      };
    } catch (error) {
      logger.error(`S3 stream upload error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a file from S3
   * @param {string} key - S3 file key
   * @returns {Promise<Object>} Delete result
   */
  async deleteFileFromS3(key) {
    try {
      const result = await deleteFile(key);
      logger.info(`File deleted successfully: ${key}`);
      return result;
    } catch (error) {
      logger.error(`S3 delete error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get presigned upload URL
   * @param {string} filename - Filename for upload
   * @param {string} folder - Folder path in S3
   * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUploadUrl(filename, folder, expiresIn = 3600) {
    try {
      const timestamp = Date.now();
      const key = `${folder}/${timestamp}-${filename}`;

      const url = await generatePresignedUrl(key, expiresIn);
      logger.info(`Presigned upload URL generated for: ${key}`);
      return {
        url,
        key,
      };
    } catch (error) {
      logger.error(`Failed to generate presigned URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get presigned download URL
   * @param {string} key - S3 file key
   * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
   * @returns {Promise<string>} Presigned download URL
   */
  async getPresignedDownloadUrl(key, expiresIn = 3600) {
    try {
      const url = await generateDownloadUrl(key, expiresIn);
      logger.info(`Presigned download URL generated for: ${key}`);
      return url;
    } catch (error) {
      logger.error(`Failed to generate download URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * List files in a folder
   * @param {string} folder - Folder path in S3
   * @returns {Promise<Array>} List of files
   */
  async listFilesInFolder(folder) {
    try {
      const files = await listFiles(folder);
      logger.info(`Listed files in folder: ${folder}`);
      return files;
    } catch (error) {
      logger.error(`Failed to list files: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get download URL for a file key
   * @param {string} key - S3 file key
   * @param {number} expiresIn - URL expiration time in seconds (default: 3600)
   * @returns {Promise<string>} Presigned download URL
   */
  async getDownloadUrl(key, expiresIn = 3600) {
    try {
      const url = await generateDownloadUrl(key, expiresIn);
      return url;
    } catch (error) {
      logger.error(`Failed to generate download URL for key ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get raw file buffer for a S3 key
   * @param {string} key - S3 file key
   * @returns {Promise<Buffer>} File buffer
   */
  async getFileBuffer(key) {
    try {
      const result = await getObject(key);
      return result.Body;
    } catch (error) {
      logger.error(`Failed to get file buffer for key ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get content type (MIME) for a S3 key
   * @param {string} key - S3 file key
   * @returns {Promise<string>} content-type or fallback
   */
  async getContentType(key) {
    try {
      const head = await headObject(key);
      return head.ContentType || "application/octet-stream";
    } catch (error) {
      logger.warn(`Failed to get content type for key ${key}: ${error.message}`);
      return "application/octet-stream";
    }
  }

  /**
   * Get S3 bucket configuration
   * @returns {Object} S3 config
   */
  getS3Config() {
    return s3Config;
  }
}

module.exports = new S3Service();
