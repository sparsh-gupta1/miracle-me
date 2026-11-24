const logger = require("../utils/logger");

/**
 * Generic preprocessor for parsing stringified JSON fields in multipart requests
 * @param {string[]} fields List of field names to parse
 * @returns {Function} Middleware function
 */
exports.parseJsonFields = (fields = []) => {
  return (req, res, next) => {
    try {
      for (const field of fields) {
        if (req.body[field]) {
          if (typeof req.body[field] === "string") {
            const trimmed = req.body[field].trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
              try {
                req.body[field] = JSON.parse(trimmed);
              } catch (e) {
                logger.warn(`Failed to parse field "${field}" as JSON, trying comma-split fallback`);
                req.body[field] = trimmed.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
              }
            } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              try {
                req.body[field] = JSON.parse(trimmed);
              } catch (e) {
                logger.warn(`Failed to parse field "${field}" as JSON, deleting invalid value`);
                delete req.body[field];
              }
            } else {
              // Plain comma-separated lists
              req.body[field] = trimmed.split(",").map(s => s.trim()).filter(Boolean);
            }
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Generic middleware factory to validate single file uploads
 * @param {Object} options Configuration options
 * @param {string} options.fieldName Name of the form-data field
 * @param {boolean} options.required Whether the file is required (default: true)
 * @param {string[]} options.allowedMimes Array of allowed MIME types
 * @param {number} options.maxSize Maximum allowed file size in bytes (default: 5MB)
 * @returns {Function} Middleware function
 */
exports.validateFile = (options = {}) => {
  const {
    fieldName = "file",
    required = true,
    allowedMimes = ["image/jpeg", "image/png", "image/gif", "image/webp"],
    maxSize = 5 * 1024 * 1024, // 5MB default
  } = options;

  return (req, res, next) => {
    const file = req.file;

    // Check presence
    if (!file) {
      if (required) {
        const err = new Error(`${fieldName} is required`);
        err.name = "ValidationError";
        err.errors = [
          {
            message: `${fieldName} is required`,
            path: [fieldName],
            type: "any.required",
          },
        ];
        return next(err);
      }
      return next();
    }

    // Check MIME type
    if (!allowedMimes.includes(file.mimetype)) {
      const err = new Error(
        `Invalid file format "${file.mimetype}" for field "${fieldName}". Allowed formats: JPEG, PNG, GIF, WEBP.`
      );
      err.name = "ValidationError";
      err.errors = [
        {
          message: `Invalid file format "${file.mimetype}" for field "${fieldName}". Allowed formats: JPEG, PNG, GIF, WEBP.`,
          path: [fieldName],
          type: "file.mimetype",
        },
      ];
      return next(err);
    }

    // Check file size
    if (file.size > maxSize) {
      const err = new Error(`File size for "${fieldName}" exceeds limit.`);
      err.name = "ValidationError";
      err.errors = [
        {
          message: `File size for "${fieldName}" exceeds limit.`,
          path: [fieldName],
          type: "file.size",
        },
      ];
      return next(err);
    }

    next();
  };
};
