const chatService = require("./chat.service.js");
const conversationService = require("./conversation.service.js");
const { User, CallRequest } = require("../models");
const redisService = require("./redis.service.js");
const logger = require("../utils/logger");
const { Op } = require("sequelize");

class CallRequestService {
  async sendCallRequest(senderId, receiverId, requestType) {
    if (!receiverId) return { success: false, message: "Receiver id is required" };

    // Optimized: Only create the record if validations passed in handler
    // We expect validations to happen before calling this for max performance
    const callRequestTypeMap = {
      audio_call: "audio",
      video_call: "video",
      chat: "chat",
      audio: "audio",
      video: "video",
    };
    const dbRequestType = callRequestTypeMap[requestType] || requestType;

    const request_created = await CallRequest.create({
      senderId,
      receiverId,
      requestType: dbRequestType,
      requestTimestamp: new Date(),
    });

    return {
      success: true,
      request_id: request_created.id,
    };
  }

  /**
   * Accept a pending request. The status flip is a single conditional UPDATE so that
   * concurrent accepts (double tap, two devices) and an accept racing the ring timeout
   * or a cancel have exactly one winner.
   */
  async acceptCallRequest(requestId, receiverId = null) {
    const where = { id: requestId, status: "pending" };
    if (receiverId) where.receiverId = receiverId;

    const [claimed] = await CallRequest.update(
      { status: "accepted", acceptanceTimestamp: new Date() },
      { where }
    );

    const request = await CallRequest.findByPk(requestId);
    if (!request) {
      return { success: false, message: "Call request not found" };
    }
    if (!claimed) {
      if (receiverId && request.receiverId !== receiverId) {
        return { success: false, message: "Only the receiving user can accept this call" };
      }
      return { success: false, alreadyHandled: true, message: `Call request is already ${request.status}` };
    }

    // Calculate and save duration
    await request.calculateDuractionToAccept();

    return { success: true, senderId: request.senderId };
  }

  /**
   * Reject a pending request. Only the receiver may reject, and only while pending —
   * a missed, cancelled or accepted request is never overwritten.
   */
  async rejectCallRequest(requestId, receiverId = null) {
    const where = { id: requestId, status: "pending" };
    if (receiverId) where.receiverId = receiverId;

    const [claimed] = await CallRequest.update(
      { status: "rejected", rejectionTimestamp: new Date() },
      { where }
    );

    const request = await CallRequest.findByPk(requestId);
    if (!request) {
      return { success: false, message: "Call request not found" };
    }
    if (!claimed) {
      if (receiverId && request.receiverId !== receiverId) {
        return { success: false, message: "Only the receiving user can reject this call" };
      }
      return { success: false, alreadyHandled: true, message: `Call request is already ${request.status}` };
    }

    const chat = await chatService.getOrCreateChat(
      request.senderId,
      request.receiverId
    );
    if (chat) await redisService.removeUserFromActiveChat(request.senderId, chat.id);
    return { success: true, senderId: request.senderId, receiverId: request.receiverId };
  }

  /**
   * Cancel a request on behalf of the caller.
   * @param {string} requestId
   * @param {object} [opts]
   * @param {string} [opts.senderId] - When set, only this user (the caller) may cancel
   * @param {string[]} [opts.statuses] - States that may be cancelled (default: pending only)
   */
  async cancelCallRequest(requestId, { senderId = null, statuses = ["pending"] } = {}) {
    const where = { id: requestId, status: { [Op.in]: statuses } };
    if (senderId) where.senderId = senderId;

    const [claimed] = await CallRequest.update(
      { status: "cancelled", cancellationTimestamp: new Date() },
      { where }
    );

    const request = await CallRequest.findByPk(requestId);
    if (!request) {
      return { success: false, message: "Call request not found" };
    }
    if (!claimed) {
      if (senderId && request.senderId !== senderId) {
        return { success: false, message: "Only the caller can cancel this call" };
      }
      return { success: false, alreadyHandled: true, message: `Call request is already ${request.status}` };
    }

    const chat = await chatService.getOrCreateChat(
      request.senderId,
      request.receiverId
    );
    if (chat) await redisService.removeUserFromActiveChat(request.senderId, chat.id);
    return { success: true, senderId: request.senderId, receiverId: request.receiverId };
  }

  /**
   * Mark an unanswered request as missed. Conditional on `pending`, so a request the
   * receiver accepted (or the caller cancelled) while the timeout was firing is left alone.
   */
  async missedCallRequest(requestId) {
    const [claimed] = await CallRequest.update(
      { status: "missed", missedTimestamp: new Date() },
      { where: { id: requestId, status: "pending" } }
    );

    const request = await CallRequest.findByPk(requestId);
    if (!request) {
      return { success: false, message: "Call request not found" };
    }
    if (!claimed) {
      return { success: false, alreadyHandled: true, message: `Call request is already ${request.status}` };
    }

    const chat = await chatService.getOrCreateChat(
      request.senderId,
      request.receiverId
    );
    if (chat) await redisService.removeUserFromActiveChat(request.senderId, chat.id);
    return { success: true, senderId: request.senderId, receiverId: request.receiverId };
  }
}

module.exports = new CallRequestService();
