const { Worker } = require("bullmq");
const { connection } = require("../queues/penalty.queue");
const penaltyService = require("../services/penalty.service");
const logger = require("../utils/logger");

const workerOptions = {
  connection,
  concurrency: 5,
};

const penaltyWorker = new Worker(
  "penaltyQueue",
  async (job) => {
    const { name, data } = job;
    const { responseWindowId, chatId, listenerId } = data;

    if (name === "warning") {
      logger.info(`Processing warning job for response window ${responseWindowId}`);
      await penaltyService.processWarning(responseWindowId, chatId, listenerId);
    } else if (name === "penalty") {
      logger.info(`Processing penalty job for response window ${responseWindowId}`);
      await penaltyService.processPenalty(responseWindowId, chatId, listenerId);
    }
  },
  workerOptions
);

penaltyWorker.on("completed", (job) => {
  logger.info(`Job ${job.id} of type ${job.name} completed successfully`);
});

penaltyWorker.on("failed", (job, err) => {
  logger.error(`Job ${job.id} of type ${job.name} failed with error:`, err);
});

module.exports = {
  penaltyWorker,
};
