const logger = require("../utils/logger");

exports.errorHandler = (err, req, res, next) => {
  // Log the error
  const errorMessage = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
  logger.error(errorMessage, { stack: err instanceof Error ? err.stack : undefined });

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message, errors: err.errors });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (err.name === "ForbiddenError") {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (err.name === "NotFoundError") {
    return res
      .status(404)
      .json({ message: err.message || "Resource not found" });
  }

  if (err.name === "ConflictError") {
    return res.status(409).json({ message: err.message });
  }

  // Default to 500 server error
  res.status(500).json({
    message: "Internal server error",
    // Include error details in non-production environments
    ...(process.env.NODE_ENV !== "production" && { error: err.message }),
  });
};
