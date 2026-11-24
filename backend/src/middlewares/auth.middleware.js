const jwt = require("jsonwebtoken");
const config = require("../config");
const { User } = require("../models");
const { isTokenRevoked } = require("../utils/tokenVersion");

const SESSION_REVOKED = {
  message: "You have been logged out. Please log in again.",
  code: "SESSION_REVOKED",
};

exports.isTokenRevoked = isTokenRevoked;

/**
 * Express middleware to authenticate requests
 */
exports.authenticate = async (req, res, next) => {
  let decoded;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    const user = await User.findByPk(decoded.id, { attributes: ["id", "tokenVersion"] });
    if (isTokenRevoked(decoded, user)) {
      return res.status(401).json(SESSION_REVOKED);
    }
  } catch (error) {
    return next(error);
  }

  req.user = decoded;
  next();
};

/**
 * Middleware to verify user is active and verified
 */
exports.verifyActive = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user || !user.isActive || !user.isVerified) {
      return res
        .status(403)
        .json({ message: "Account is inactive or not verified" });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has admin role
 */
exports.requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required. User not found or not an admin." });
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has listener role or admin role
 */
exports.requireListener = (req, res, next) => {
  if (req.user.role !== "listener" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Listener access required" });
  }
  next();
};

/**
 * Function to create a middleware that requires specific roles
 * @param {Array} roles - Array of allowed roles
 * @returns {Function} Middleware function
 */
exports.requireRoles = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access restricted.`,
      });
    }
    next();
  };
};

/**
 * Socket.io middleware to authenticate socket connections
 */
exports.authSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, config.jwt.secret);

    // Check if user exists and is active
    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "role", "isActive", "isVerified", "tokenVersion"],
    });
    if (!user || !user.isActive || !user.isVerified) {
      return next(new Error("User is inactive or not verified"));
    }
    if (isTokenRevoked(decoded, user)) {
      return next(new Error(SESSION_REVOKED.message));
    }

    socket.user = {
      id: user.id,
      role: user.role,
    };
    next();
  } catch (error) {
    next(new Error("Invalid or expired token"));
  }
};
