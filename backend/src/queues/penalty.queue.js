const { Queue } = require("bullmq");
const Redis = require("ioredis");
const logger = require("../utils/logger");

const redisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const connection = new Redis(redisOptions);

const penaltyQueue = new Queue("penaltyQueue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

penaltyQueue.on("error", (err) => {
  logger.error("Penalty Queue Error", err);
});

module.exports = {
  penaltyQueue,
  connection,
};
