require("dotenv").config();

const { initializeFirebase } = require("./config/firebase-admin");

const http = require("http");
const app = require("./app");

const { Database, WebSocket } = require("./config");
const logger = require("./utils/logger");
const redisClient = require("./config/redis");
const redisService = require("./services/redis.service");
const { createShutdown } = require("./utils/shutdown");

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const startServer = async () => {
  try {
    // Firebase init
    try {
      initializeFirebase();
      logger.info("🔥 Firebase initialized");
    } catch (err) {
      logger.error("❌ Firebase initialization failed:", err);
    }

    // Database
    try {
      await Database.testConnection();
      await Database.initModels();
      logger.info("🟢 Database connected and models initialized");
    } catch (dbErr) {
      logger.error("❌ Database connection failed:", dbErr);
    }

    // Redis
    redisClient.on("error", (err) => {
      logger.error("❌ Redis connection error:", err);
    });

    try {
      await redisService.connect(redisClient);
      logger.info("🟢 Redis connected");
    } catch (redisErr) {
      logger.error("❌ Redis service failed:", redisErr);
    }


    // WebSocket
    try {
      const io = WebSocket.initializeWebsocket(server);
      const chatSessionService = require("./services/chatSession.service");
      chatSessionService.start(io);
      const callDurationMonitor = require("./services/callDurationMonitor.service");
      await callDurationMonitor.recoverActiveSessions(io);
      // Re-arms reconnect grace timers that were waiting when the previous process stopped.
      await require("./services/callLifecycle.service").recoverReconnectTimers();
      // Closes requests whose timers were lost and frees users nothing else would free.
      require("./services/staleRequestSweeper.service").start(io);
      logger.info("🟢 WebSocket initialized and active session monitors started");
    } catch (wsErr) {
      logger.error("❌ WebSocket initialization failed:", wsErr);
    }

    // Start HTTP Server
    server.listen(PORT, "0.0.0.0", () => {
      logger.info(
        `🚀 Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`
      );
    });

    // Initialize BullMQ Workers
    try {
      require("./workers/penalty.worker");
      logger.info("🟢 Penalty worker initialized");
    } catch (workerErr) {
      logger.error("❌ Penalty worker initialization failed:", workerErr);
    }

    server.on("error", (err) => {
      logger.error("❌ Server error:", err);
    });

  } catch (err) {
    logger.error("❌ Unexpected startup error:", err);
  }
};

/**
 * Graceful shutdown. Sockets are deliberately not closed: running every socket's disconnect
 * handler here would pause every live call and broadcast everyone offline. The OS closes them
 * when we exit, clients reconnect to the new process, and call state in Redis stays intact.
 */
const shutdown = createShutdown({
  logger,
  steps: [
    {
      name: "background monitors",
      run: () => {
        require("./services/chatSession.service").stop();
        require("./services/staleRequestSweeper.service").stop();
        require("./services/callDurationMonitor.service").suspendAll();
      },
    },
    {
      // Not awaited: open WebSockets would keep it pending until the force-exit timer.
      name: "stop accepting connections",
      run: () => server.close(),
    },
    {
      // Before Redis: lets the current penalty job finish with its connections still up.
      name: "BullMQ",
      run: async () => {
        const { penaltyWorker } = require("./workers/penalty.worker");
        const { penaltyQueue, connection } = require("./queues/penalty.queue");
        if (penaltyWorker) await penaltyWorker.close();
        if (penaltyQueue) await penaltyQueue.close();
        if (connection) await connection.quit();
      },
    },
    {
      name: "Redis",
      run: async () => {
        if (redisClient?.isOpen) await redisClient.quit();
      },
    },
    {
      name: "database",
      run: async () => {
        if (Database?.sequelize?.close) await Database.sequelize.close();
      },
    },
  ],
});

process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT", () => shutdown("SIGINT", 0));

// State after an uncaught exception is unknown: clean up and let PM2 start a fresh process.
process.on("uncaughtException", (error) => {
  logger.error("❌ Uncaught Exception:", error);
  shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("❌ Unhandled Rejection:", reason);
});

startServer();
