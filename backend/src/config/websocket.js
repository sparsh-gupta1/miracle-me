// # WebSocket initialization
const socketIo = require("socket.io");
const logger = require("../utils/logger");
const chatHandler = require("../websocket/handlers/chat.handler");
const { User } = require("../models");
const jwt = require("jsonwebtoken");
const { isTokenRevoked } = require("../utils/tokenVersion");
const callRequestHandler = require("../websocket/handlers/callRequest.handler");
const notificationHandler = require("../websocket/handlers/notification.handler");
const conversationHandler = require("../websocket/handlers/conversation.handler");
const walletHandler = require("../websocket/handlers/wallet.handler");
const withdrawalHandler = require("../websocket/handlers/withdrawal.handler");
const redisService = require("../services/redis.service");
const { emitStatus } = require("../websocket/presence");
const {
  jwt: { secret },
} = require("./vars");

let io;

/**
 * Initialize WebSocket server
 * @param {Object} server - HTTP server instance
 */
function initializeWebsocket(server) {
  io = socketIo(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
      methods: ["GET", "POST", "OPTIONS"],
    },
    transports: ["websocket", "polling"],
  });

  // Middleware for authentication
  io.use(async (socket, next) => {
    // A rejected handshake only reaches the client as connect_error; log it so the cause is visible.
    const reject = (reason, message, details = "") => {
      logger.warn(`SOCKET_AUTH_REJECTED reason=${reason} ${details}`.trim());
      return next(new Error(message));
    };
    try {
      const {
        handshake: { auth },
      } = socket;
      let token = auth?.token;
      if (!token) {
        return reject("missing_token", "Authentication required");
      }

      const decoded = jwt.verify(token, secret);

      const user = await User.findByPk(decoded.id, {
        attributes: ["id", "role", "isActive", "isVerified", "tokenVersion"],
      });
      if (!user || !user.isActive || !user.isVerified) {
        return reject(
          !user ? "user_not_found" : "inactive_or_unverified",
          "User is inactive or not verified",
          `userId=${decoded.id} isActive=${user?.isActive} isVerified=${user?.isVerified}`,
        );
      }
      if (isTokenRevoked(decoded, user)) {
        return reject(
          "token_revoked",
          "You have been logged out. Please log in again.",
          `userId=${user.id} tv=${decoded.tv} dbTv=${user.tokenVersion}`,
        );
      }

      socket.user = {
        id: user.id,
        role: user.role,
      };
      next();
    } catch (error) {
      // jwt errors (expired / invalid signature) and DB failures, e.g. a missing column.
      logger.warn(`SOCKET_AUTH_REJECTED reason=${error.name || "error"} message=${error.message}`);
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;

    logger.info(`User connected: ${userId}`);

    if (socket.user.role === "user") {
      redisService
        .setUserOnline(userId, socket.id, socket.user.role)
        .catch((error) => logger.error("Presence init error", error));
      socket.presenceRefresh = setInterval(() => {
        redisService
          .refreshUserSocket(userId, socket.id, socket.user.role)
          .catch((error) => logger.error("Presence refresh error", error));
      }, 60_000);

      // Automatically broadcast that the user is online
      Promise.all([
        redisService.getUserBusyStatus(userId),
        User.findByPk(userId, { attributes: ["isBusy"] })
      ]).then(([rBusy, uData]) => {
        emitStatus(socket, "user-status-changed", {
          userId,
          isOnline: true,
          isBusy: !!rBusy || !!uData?.isBusy,
          lastSeen: new Date(),
        }, "user");
      }).catch(err => logger.error("Error fetching busy status", err));
    }

    // Join user to their personal room, and to their role's room (presence audiences)
    socket.join(`user:${userId}`);
    socket.join(`role:${socket.user.role}`);

    // Register event handlers
    chatHandler(io, socket);
    callRequestHandler(io, socket);
    notificationHandler(io, socket);
    conversationHandler(io, socket);
    walletHandler(io, socket);
    withdrawalHandler(io, socket);

    // Signal that socket is ready and listeners are registered
    socket.emit("socket-ready", { userId });

    socket.on("disconnect", async () => {
      logger.info(`User disconnected: ${userId}`);
      if (socket.presenceRefresh) clearInterval(socket.presenceRefresh);
      // Redis/DB hiccups here must not become unhandled rejections that take the process down.
      try {
        if (socket.user.role === "user") {
          const stillOnline = await redisService.removeUserSocket(
            userId,
            socket.id,
            socket.user.role,
          );
          const rBusy = await redisService.getUserBusyStatus(userId);
          const uData = await User.findByPk(userId, { attributes: ["isBusy"] });
          emitStatus(socket, "user-status-changed", {
            userId,
            isOnline: stillOnline,
            isBusy: !!rBusy || !!uData?.isBusy,
            lastSeen: new Date(),
          }, "user");
        }
        if (
          socket.user.role === "listener" ||
          socket.user.role === "astrologer"
        ) {
          const activeChat = await redisService.getUserActiveChat(userId);
          if (activeChat) {
            await redisService.removeUserFromActiveChat(userId, activeChat);
          }
        }
      } catch (error) {
        logger.error(`Error handling disconnect for ${userId}:`, error);
      }
    });
  });

  return io;
}

/**
 * Get the io instance
 * @returns {Object} io instance
 */
function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}

module.exports = {
  initializeWebsocket,
  getIO,
};
