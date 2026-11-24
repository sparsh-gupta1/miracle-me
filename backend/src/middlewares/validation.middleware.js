const Joi = require("joi");

/**
 * Generic validation middleware for Joi schemas
 * @param {Object} schema - Joi schema object
 * @returns {Function} Middleware function
 */
exports.validate = (schema) => (req, res, next) => {
  if (!schema) return next();

  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessage = error.details
      .map((detail) => detail.message)
      .join(", ");

    const err = new Error(errorMessage);
    err.name = "ValidationError";
    return next(err);
  }

  // Replace req.body with validated value (handles stripUnknown)
  req.body = value;
  next();
};

/**
 * Validation middleware for query strings. Express 5 makes req.query read-only,
 * so the validated (and defaulted/coerced) value is exposed as req.validatedQuery.
 * @param {Object} schema - Joi schema object
 * @returns {Function} Middleware function
 */
exports.validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const err = new Error(error.details.map((detail) => detail.message).join(", "));
    err.name = "ValidationError";
    return next(err);
  }

  req.validatedQuery = value;
  next();
};
