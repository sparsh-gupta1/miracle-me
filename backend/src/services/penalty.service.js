const { ResponseWindow, Chat, User } = require("../models");
const { penaltyQueue } = require("../queues/penalty.queue");
const redisService = require("./redis.service");
const walletService = require("./wallet.service");
const pricingService = require("./pricing.service");
const logger = require("../utils/logger");
const { sequelize } = require("../config/database");

class PenaltyService {
  /**
   * Starts a response tracking window for a chat.
   * @param {string} chatId
   * @param {string} userId (The user waiting for a response)
   * @param {string} listenerId (The listener who must respond)
   */
  async startResponseWindow(chatId, userId, listenerId) {
    try {
      const redisKey = `chat:${chatId}:unanswered_response`;
      const lockKey = `lock:penalty_create:${chatId}`;

      // Acquire an atomic lock for this specific chat
      const lockAcquired = await redisService.client.set(lockKey, "1", { NX: true, EX: 5 });
      if (!lockAcquired) {
         // Another message is currently creating a response window for this chat.
         logger.info(`Response window creation already in progress for chat ${chatId}`);
         return;
      }

      try {
        const existingWindowId = await redisService.client.get(redisKey);

        if (existingWindowId) {
          // Window already exists, don't start a new one (multiple user messages case)
          return;
        }

        // Create persistent response window
        const responseWindow = await ResponseWindow.create({
          chatId,
          userId,
          listenerId,
          status: "waiting",
        });

        // Save to Redis
        await redisService.client.set(redisKey, responseWindow.id);

        // Enqueue 15s warning job
        await penaltyQueue.add(
          "warning",
          {
            responseWindowId: responseWindow.id,
            chatId,
            userId,
            listenerId,
          },
          { delay: 15000 }
        );

        // Enqueue 20s penalty job
        await penaltyQueue.add(
          "penalty",
          {
            responseWindowId: responseWindow.id,
            chatId,
            userId,
            listenerId,
          },
          { delay: 20000 }
        );

        logger.info(
          `Response window started for chat ${chatId}, listener ${listenerId}`
        );
      } finally {
        await redisService.client.del(lockKey);
      }
    } catch (error) {
      logger.error("Error starting response window:", error);
    }
  }

  /**
   * Registers a response from the listener, closing the window.
   * @param {string} chatId
   */
  async registerResponse(chatId) {
    try {
      const redisKey = `chat:${chatId}:unanswered_response`;
      const responseWindowId = await redisService.client.get(redisKey);

      if (!responseWindowId) {
        return;
      }

      const responseWindow = await ResponseWindow.findByPk(responseWindowId);
      if (responseWindow && responseWindow.status !== "responded") {
        await responseWindow.update({
          status: "responded",
          respondedAt: new Date(),
        });
        logger.info(`Response window ${responseWindowId} marked as responded`);
      }

      // Clear from Redis
      await redisService.client.del(redisKey);
    } catch (error) {
      logger.error("Error registering response:", error);
    }
  }

  /**
   * Processes the 15-second warning job
   * @param {string} responseWindowId
   * @param {string} chatId
   * @param {string} listenerId
   */
  async processWarning(responseWindowId, chatId, listenerId) {
    try {
      const responseWindow = await ResponseWindow.findByPk(responseWindowId);
      if (!responseWindow || responseWindow.status !== "waiting") {
        return; // Already responded, cancelled, or warned
      }

      // Check if chat is still active
      const chat = await Chat.findByPk(chatId);
      if (!chat || chat.status !== "started") {
        await responseWindow.update({ status: "cancelled" });
        return;
      }

      // Send Socket warning
      try {
        const WebSocket = require("../config/websocket");
        const io = WebSocket.getIO();
        if (io) {
          io.to(`user:${listenerId}`).emit("listener-warning", {
            chatId,
            message: "Please respond to the user to continue the conversation.",
          });
        }
      } catch (wsErr) {
        logger.warn(`Could not send socket warning (websocket might not be initialized in this environment): ${wsErr.message}`);
      }

      // Persist warning sent
      await responseWindow.update({
        status: "warning_sent",
        warningSent: true,
        warningAt: new Date(),
      });

      logger.info(`Sent 15s warning to listener ${listenerId} for chat ${chatId}`);
    } catch (error) {
      logger.error("Error processing response warning:", error);
      throw error; // Let BullMQ retry
    }
  }

  /**
   * Processes the 20-second penalty job
   * @param {string} responseWindowId
   * @param {string} chatId
   * @param {string} listenerId
   */
  async processPenalty(responseWindowId, chatId, listenerId) {
    const t = await sequelize.transaction();
    try {
      // 1. Lock the response window to prevent race conditions
      const responseWindow = await ResponseWindow.findByPk(responseWindowId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (
        !responseWindow ||
        responseWindow.status === "responded" ||
        responseWindow.status === "cancelled" ||
        responseWindow.penaltyApplied
      ) {
        await t.rollback();
        return; // Already resolved
      }

      // 2. Verify Chat is still active
      const chat = await Chat.findByPk(chatId, { transaction: t });
      if (!chat || chat.status !== "started") {
        await responseWindow.update({ status: "cancelled" }, { transaction: t });
        await t.rollback();
        return;
      }

      // 3. Verify listener role and pricing to calculate penalty amount
      const listener = await User.findByPk(listenerId, { transaction: t });
      if (!listener) {
        await t.rollback();
        return;
      }

      // We need to calculate price per minute for the listener for chat
      const pricingInfo = await pricingService.getEffectivePricing(
        listenerId,
        "chat"
      );
      
      const pricePerMinuteVal = parseFloat(pricingInfo.pricePerMinute || 0);
      const ratePerSecond = Math.round((pricePerMinuteVal / 60) * 1000000) / 1000000;
      const penaltySeconds = 20;
      
      // We calculate penaltyAmount by exactly 20 seconds. 
      // The instruction: "Convert 20 seconds into the existing earning/billing monetary representation."
      // "Deduct that amount from the listener's earning wallet"
      let penaltyAmount = parseFloat(
        (penaltySeconds * ratePerSecond).toFixed(4)
      );

      // If rate is 0, nothing to deduct, but still mark applied
      if (penaltyAmount > 0) {
        try {
          // Debit Listener's earning wallet
          await walletService.debitWallet(
            listenerId,
            penaltyAmount,
            "response_penalty",
            responseWindow.id,
            `Response penalty for chat ${chatId} (${penaltySeconds}s timeout)`,
            {
              chatId,
              responseWindowId,
              penaltySeconds,
              reason: "Listener response timeout",
            },
            t,
            "earning"
          );

          // Keep daily/monthly earnings net of penalties
          const billingService = require("./billing.service");
          await billingService.applyDailyPenalty(listenerId, penaltyAmount, t);
        } catch (debitErr) {
          if (debitErr.message === "Insufficient balance") {
            logger.warn(`Listener ${listenerId} has insufficient balance for penalty in chat ${chatId}. Marking as waived.`);
            await responseWindow.update({
              status: "penalized",
              penaltyApplied: true,
              penaltySeconds: penaltySeconds,
              penaltyAmount: 0,
              penaltyAt: new Date(),
            }, { transaction: t });
            await t.commit();
            return;
          }
          throw debitErr;
        }
      }

      // Update Window
      await responseWindow.update(
        {
          status: "penalized",
          penaltyApplied: true,
          penaltySeconds: penaltySeconds,
          penaltyAmount: penaltyAmount,
          penaltyAt: new Date(),
        },
        { transaction: t }
      );

      await t.commit();

      if (penaltyAmount > 0) {
        await require("./billing.service").emitEarningsUpdate(listenerId);
      }

      logger.info(
        `Applied 20s penalty (${penaltyAmount}) to listener ${listenerId} for chat ${chatId}`
      );
    } catch (error) {
      await t.rollback();
      logger.error("Error processing penalty job:", error);
      throw error; // Let BullMQ retry
    } finally {
      // Clear from Redis so future messages can start a new penalty window for this chat
      try {
        await redisService.client.del(`chat:${chatId}:unanswered_response`);
      } catch (redisErr) {
        logger.error(`Error clearing unanswered_response key for chat ${chatId}:`, redisErr);
      }
    }
  }
}

module.exports = new PenaltyService();
