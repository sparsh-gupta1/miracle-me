const redis = require("redis");
const logger = require("../utils/logger");

const redisClient = redis
  .createClient({
    url: `redis://${process.env.REDIS_HOST || "127.0.0.1"}:${process.env.REDIS_PORT || 6379}`,
    password: process.env.REDIS_PASSWORD || undefined,
  })
  .on("connect", () => logger.info("Redis Client Connected"))
  .on("error", (err) => logger.error("Redis Client Error", err));

module.exports = redisClient;
