// handlers/chat.handler.js
const { User } = require("../../models");
const notificationConstants = require("../../constants/notification.constants");
const chatService = require("../../services/chat.service");
const redisService = require("../../services/redis.service");
const s3Service = require("../../services/s3.service");
const logger = require("../../utils/logger");
const { roles } = require("../../utils/CONSTANT");
const {
  convertIncomingAudioToStream,
  generateRandomFilename,
} = require("../../utils/audio-stream");
const penaltyService = require("../../services/penalty.service");
const pushService = require("../../services/push.service");
const { emitStatus } = require("../presence");
const { callerInSessionError, listenerBusyError, tryAgainError } = require("../../utils/busyErrors");

module.exports = (io, socket) => {
  const userId = socket.user.id;

  // Mark a started chat as connected and tell both sides, once. A failure here must not
  // block the message; the chat simply stays unbilled until the next reply connects it.
  const connectChat = async (chatId, senderId, receiverId) => {
    try {
      const conversationService = require("../../services/conversation.service");
      const connected = await conversationService.markChatConnected(chatId);
      if (!connected) return;
      const payload = { chatId, message: "Chat connected. Billing has started." };
      io.to([`chat:${chatId}`, `user:${senderId}`, `user:${receiverId}`])
        .emit("chat-session-connected", payload);
    } catch (error) {
      logger.warn(`Failed to mark chat ${chatId} connected: ${error.message}`);
    }
  };

  // Join a chat room
  socket.on("join-chat", async (data) => {
    try {
      const { chatId, receiverId } = data;

      // Validate input
      if (!receiverId) {
        socket.emit("error", { message: "Receiver ID is required" });
        return;
      }

      // Validate the chat belongs to the user
      const chat = await chatService.getOrCreateChat(userId, receiverId);

      if (!chat) {
        socket.emit("error", { message: "Chat not found" });
        return;
      }

      if (chat.id !== chatId && chatId !== null) {
        socket.emit("error", { message: "Invalid chat ID" });
        return;
      }

      const roomId = `chat:${chat?.id}`;

      // Leave previous chat room if any
      const currentRoom = Array.from(socket.rooms).find((room) =>
        room.startsWith("chat:"),
      );
      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
        const oldChatId = currentRoom.split(":")[1];
        await redisService.removeUserFromActiveChat(userId, oldChatId);
      }

      // Join the new chat room
      socket.join(roomId);

      // Mark user as active in this chat
      await redisService.setUserActiveInChat(userId, chat?.id);

      // Clear pending notification flag if any
      await redisService.clearPendingNotification(userId, chat?.id);

      // Get recent messages
      const messagesData = await chatService.getChatMessages(
        chat?.id,
        userId,
        1,
        50,
      );

      socket.emit("chat-joined", {
        chatId: chat?.id,
        messages: messagesData.messages,
        hasMore: messagesData.hasMore,
        totalCount: messagesData.totalCount,
      });

      // Mark all unread messages as read
      const readMessageIds = await chatService.markMessagesAsRead(
        chat?.id,
        userId,
      );
      if (readMessageIds.length > 0) {
        // Notify the other participant that messages were read
        socket.to(roomId).emit("messages-read", {
          chatId: chat?.id,
          messageIds: readMessageIds,
          readBy: userId,
          readAt: new Date(),
        });
      }
      logger.info(`User ${userId} joined chat ${chat?.id}`);
    } catch (error) {
      logger.error("Error joining chat:", error);

      // Provide more specific error message
      let errorMessage = "Failed to join chat";
      if (error.message.includes("does not exist")) {
        errorMessage = error.message; // Use the specific user not found message
      }

      socket.emit("error", { message: errorMessage });
    }
  });

  // Leave a chat room
  socket.on("leave-chat", async (data) => {
    try {
      const { chatId } = data;
      const roomId = `chat:${chatId}`;

      socket.leave(roomId);
      await redisService.removeUserFromActiveChat(userId, chatId);

      socket.emit("chat-left", { chatId });
      logger.info(`User ${userId} left chat ${chatId}`);
    } catch (error) {
      logger.error("Error leaving chat:", error);
      socket.emit("error", { message: "Failed to leave chat" });
    }
  });

  // Send a message
  socket.on("send-message", async (data) => {
    // Session locks taken by the busy guard; released in `finally` whatever happens.
    const heldLocks = [];
    try {
      if (socket.user.exp && Date.now() >= socket.user.exp * 1000) {
        socket.emit("error", { message: "Session expired, please reconnect" });
        socket.disconnect(true);
        return;
      }

      const {
        chatId,
        receiverId,
        content,
        messageType = "text",
        file,
        filename,
        contentType,
      } = data;

      let finalContent = content;

      // // Handle media uploads for image, video, voice
      // if (
      //   messageType === "image" ||
      //   messageType === "video" ||
      //   messageType === "voice"
      // ) {
      //   if (!file || !filename) {
      //     socket.emit("error", {
      //       message: "File data or filename missing for media message",
      //     });
      //     return;
      //   }

      //   // Determine folder based on messageType
      //   const folder =
      //     messageType === "image"
      //       ? "chat-images"
      //       : messageType === "video"
      //         ? "chat-videos"
      //         : "chat-voices";

      //   let uploadResult;

      //   if (messageType === "voice") {
      //     // Support dataURI/base64/plain base64 string, Buffer, ArrayBuffer, Uint8Array, or Readable stream
      //     let converted;
      //     try {
      //       converted = convertIncomingAudioToStream(file);
      //     } catch (err) {
      //       socket.emit("error", { message: err.message || "Invalid audio input" });
      //       return;
      //     }

      //     const { stream, buffer, contentType: inferredContentType, extension } = converted;
      //     const finalContentType = contentType || inferredContentType || "audio/m4a";
      //     const finalFilename = filename || generateRandomFilename(extension || (finalContentType.split('/').pop() || 'm4a'));

      //     if (buffer) {
      //       uploadResult = await s3Service.uploadFileToS3(
      //         buffer,
      //         finalFilename,
      //         folder,
      //         finalContentType
      //       );
      //     } else {
      //       // Stream-only path
      //       uploadResult = await s3Service.uploadStreamToS3(
      //         stream,
      //         finalFilename,
      //         folder,
      //         finalContentType
      //       );
      //     }
      //   } else {
      //     // image & video - expected base64 string or Buffer
      //     const fileBuffer = Buffer.isBuffer(file) ? file : Buffer.from(file, "base64");
      //     uploadResult = await s3Service.uploadFileToS3(
      //       fileBuffer,
      //       filename,
      //       folder,
      //       contentType || "application/octet-stream"
      //     );
      //   }

      //   if (!uploadResult || !uploadResult.success) {
      //     socket.emit("error", { message: "Failed to upload media file" });
      //     return;
      //   }

      //   finalContent = uploadResult.key; // Store only the key
      // } else {

      // For text messages, validate content
      if (!finalContent?.trim()) {
        socket.emit("error", { message: "Message content is required" });
        return;
      }

      finalContent = finalContent.trim();
      // }

      // Validate required fields
      if (!chatId || !receiverId) {
        socket.emit("error", {
          message: "Chat ID and receiver ID are required",
        });
        return;
      }

      // Determine if receiver is online and active in chat (with Socket.io fallback)
      const receiver = await User.findByPk(receiverId, {
        attributes: ["id", "role"],
      });
      const sender = await User.findByPk(userId, {
        attributes: ["id", "role"],
      });
      const receiverSockets = await io.in(`user:${receiverId}`).fetchSockets();
      const isOnline = await redisService.isUserReachable(
        receiverId,
        receiver?.role,
      );

      const isReceiverActiveInChat = await redisService.isUserActiveInChat(
        receiverId,
        chatId,
      );
      const isActuallyActiveInChat =
        isReceiverActiveInChat ||
        receiverSockets.some((s) => s.rooms.has(`chat:${chatId}`));

      // 0. Manage Chat Session (Second-Based Billing)
      const { Chat } = require("../../models");
      const conversationService = require("../../services/conversation.service");
      const chatSessionService = require("../../services/chatSession.service");

      const chatObj = await Chat.findByPk(chatId);
      if (!chatObj) {
        socket.emit("error", { message: "Chat not found" });
        return;
      }
      if (
        chatObj.participant1Id !== userId &&
        chatObj.participant2Id !== userId
      ) {
        socket.emit("error", { message: "Unauthorized" });
        return;
      }
      // ── Atomic Busy Guard ────────────────────────────────────────────────────
      const verifyUserNotBusy = async (uId, { isReceiver = false } = {}) => {
        const lockToken = await redisService.acquireUserSessionLock(uId, "chat", String(chatId));
        if (!lockToken) {
          logger.info(`BUSY_LOCK_REJECTED: userId=${uId} sessionType=chat sessionId=${chatId}`);
          return { locked: false };
        }
        heldLocks.push({ uId, token: lockToken });
        
        let isGenuinelyBusy = false;
        const rBusy = await redisService.getUserBusyStatus(uId);
        const uData = await User.findByPk(uId, { attributes: ["id", "isBusy", "isManualBusy"] });

        // A listener's do-not-disturb is a hard "no" for incoming requests and is never healed.
        if (isReceiver && uData?.isManualBusy) {
          logger.info(`BUSY_MANUAL_REJECTED: userId=${uId} sessionType=chat sessionId=${chatId}`);
          return { locked: true, token: lockToken, busy: true, manual: true };
        }

        if (rBusy) {
          if (rBusy.conversationId !== String(chatId)) {
            isGenuinelyBusy = true;
          }
        } else if (uData?.isBusy) {
          // Do not trust User.isBusy independently, but check it as a hint for potential staleness
          isGenuinelyBusy = true;
        }
        
        if (isGenuinelyBusy) {
          logger.info(`BUSY_STATE_VERIFIED: checking DB for userId=${uId}`);
          const trulyBusy = await conversationService.isUserTrulyBusy(uId);
          
          if (trulyBusy.status === 'BUSY') {
            // Check if the only reason they are busy is THIS chat.
            // If the chat is already started, we should allow it.
            if (chatObj.status === "started") {
               // They are just busy with THIS chat.
               isGenuinelyBusy = false;
            } else {
               logger.info(`BUSY_LOCK_REJECTED: userId=${uId} sessionType=chat sessionId=${chatId}`);
               return { locked: true, token: lockToken, busy: true };
            }
          } else if (trulyBusy.status === 'CHECK_FAILED') {
            logger.error(`BUSY_STATE_CHECK_FAILED: userId=${uId} sessionType=chat sessionId=${chatId} error=${trulyBusy.error?.message}`);
            return { locked: true, token: lockToken, busy: true, error: trulyBusy.error };
          } else if (trulyBusy.status === 'NOT_BUSY') {
            logger.info(`STALE_BUSY_STATE_HEALED: userId=${uId} sessionType=chat sessionId=${chatId}`);
            // Nothing real backs the flag: release it (never touching manual busy) and tell clients.
            await conversationService.releaseBusyForSession({ userIds: [uId], io, force: true });
            isGenuinelyBusy = false;
          }
        }
        
        logger.info(`BUSY_LOCK_ACQUIRED: userId=${uId} sessionType=chat sessionId=${chatId}`);
        return { locked: true, token: lockToken, busy: false };
      };

      // A chat that is already started owns the busy flags of both participants, so every
      // message after the first skips the guard. Taking the 15s lock per message made two quick
      // sends (or both sides typing at once) reject each other as "busy".
      let callerCheck = { locked: true, busy: false, token: null };
      let receiverCheck = { locked: true, busy: false, token: null };
      if (chatObj.status !== "started") {
        callerCheck = await verifyUserNotBusy(userId);
        if (!callerCheck.locked || callerCheck.busy) {
          if (callerCheck.token) await redisService.releaseUserSessionLock(userId, callerCheck.token);
          if (callerCheck.token) logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=chat sessionId=${chatId}`);
          // No busy broadcast: contention or a failed check is not evidence the caller is busy.
          // Lock contention / failed check -> TRY_AGAIN; the sender's own other session ->
          // CALLER_IN_SESSION, so the app doesn't show this listener (or every listener) as busy.
          const payload = !callerCheck.locked || callerCheck.error
            ? tryAgainError()
            : await callerInSessionError(conversationService, userId);
          return socket.emit("error", payload);
        }

        receiverCheck = await verifyUserNotBusy(receiverId, { isReceiver: true });
        if (!receiverCheck.locked || receiverCheck.busy) {
          await redisService.releaseUserSessionLock(userId, callerCheck.token);
          logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=chat sessionId=${chatId}`);
          if (receiverCheck.token) await redisService.releaseUserSessionLock(receiverId, receiverCheck.token);
          if (receiverCheck.token) logger.info(`BUSY_LOCK_RELEASED: userId=${receiverId} sessionType=chat sessionId=${chatId}`);
          return socket.emit(
            "error",
            !receiverCheck.locked || receiverCheck.error ? tryAgainError() : listenerBusyError()
          );
        }
      }
      // ── End Busy Guard ────────────────────────────────────────────────────

      if (chatObj.status !== "started") {
        logger.info(`Starting new chat session for chat ${chatId}`);
        try {
          // The session is open but not connected until the other side replies; billing and
          // free minutes count only from that reply (see markChatConnected below).
          const started = await conversationService.startConversation(
            chatId,
            false,
            userId,
            "chat",
            io,
            { awaitingReply: true },
          );

          // Now set busy status
          await redisService.setUserBusyStatus(userId, chatId, "chat");
          await redisService.setUserBusyStatus(receiverId, chatId, "chat");
          await User.update({ isBusy: true }, { where: { id: [userId, receiverId] } });
          
          // Store the payer startConversation resolved (the "user" participant), not the first sender.
          await redisService.setChatSessionActivity(chatId, started?.payerId || userId);
          socket.emit("chat-session-started", {
            chatId,
            message: "Chat session started. Waiting for a reply; billing starts when they respond.",
          });
          // A listener/astrologer opening the chat is already "the reply": connect at once.
          if (started?.payerId && started.payerId !== userId) {
            await connectChat(chatId, userId, receiverId);
          }
        } catch (error) {
          logger.error(`Failed to start chat session: ${error.message}`);
          await redisService.releaseUserSessionLock(userId, callerCheck.token);
          await redisService.releaseUserSessionLock(receiverId, receiverCheck.token);
          // The chat request that led here (call-request type "chat") already marked both
          // users busy. The session never started (e.g. insufficient balance), so release
          // them; otherwise the listener shows busy to everyone, and to this user's retry
          // after recharging, until the Redis TTL.
          await conversationService
            .releaseUnstartedRequestState(chatId, [userId, receiverId], io)
            .catch((releaseErr) =>
              logger.error(`Failed to release busy state for chat ${chatId}: ${releaseErr.message}`)
            );
          logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=chat sessionId=${chatId}`);
          logger.info(`BUSY_LOCK_RELEASED: userId=${receiverId} sessionType=chat sessionId=${chatId}`);

          // The user always pays, so when a listener/astrologer sends the first message the
          // balance error is about the user's wallet: tell the sender plainly and prompt the
          // user to recharge (same as a practitioner-initiated call in callRequest.handler).
          if (error.message.startsWith("Insufficient balance")) {
            const [sender, receiver] = await Promise.all([
              User.findByPk(userId, { attributes: ["id", "name", "role"] }),
              User.findByPk(receiverId, { attributes: ["id", "role", "platform", "fcmToken"] }),
            ]);
            if (sender && sender.role !== "user" && receiver?.role === "user") {
              const senderName = sender.name || "The listener";
              io.to(`user:${receiverId}`).emit("wallet:recharge_prompt", {
                message: `${senderName} wants to talk to you. Please recharge your wallet to connect.`,
                callerId: userId,
                serviceType: "chat",
              });
              pushService.sendRechargeNotification(receiver, senderName, "chat")
                .catch((err) => logger.error(`[Push] Failed to send recharge notification: ${err.message}`));
              return socket.emit("error", { message: "User does not have enough balance to start this chat." });
            }
          }
          return socket.emit("error", { message: error.message });
        }
      }
      
      // Release locks
      await redisService.releaseUserSessionLock(userId, callerCheck.token);
      await redisService.releaseUserSessionLock(receiverId, receiverCheck.token);
      logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=chat sessionId=${chatId}`);
      logger.info(`BUSY_LOCK_RELEASED: userId=${receiverId} sessionType=chat sessionId=${chatId}`);

      // ── Balance exhaustion guard ──────────────────────────────────────────────
      // For an active chat session, check on every message whether the payer's
      // free minutes AND wallet balance are both exhausted. If so, end the session
      // and block the message — mirroring the call auto-termination behaviour.
      // The stored payer lives in a key with an idle TTL. When it is gone, resolve it from the
      // participants' roles; never fall back to the sender, or a listener's own (empty) wallet
      // would end the user's paid session.
      let sessionPayerId = null;
      if (chatObj.status === "started") {
        sessionPayerId = await redisService.getChatSessionPayerId(chatId);
        if (!sessionPayerId) {
          const resolved = conversationService.resolvePayerEarner({
            participant1: sender,
            participant2: receiver,
          });
          sessionPayerId = resolved?.payerId || null;
        }
        try {
          await redisService.setChatSessionActivity(chatId, sessionPayerId);
        } catch (activityError) {
          logger.warn(`Failed to refresh chat session activity for ${chatId}: ${activityError.message}`);
        }
        // The first message from the non-paying side connects the session (billing starts).
        // Peer chats with no known payer are not billed, so any message may connect them.
        if (!sessionPayerId || userId !== sessionPayerId) {
          await connectChat(chatId, userId, receiverId);
        }
      }

      // Peer chats (listener↔listener, astrologer↔astrologer) have no payer and are not billed.
      if (chatObj.status === "started" && sessionPayerId) {
        const walletService = require("../../services/wallet.service");
        const freeMinutesService = require("../../services/freeMinutes.service");

        const [walletBalance, freeUsage] = await Promise.all([
          walletService.getWalletBalance(sessionPayerId),
          freeMinutesService.getUserFreeMinutesUsage(sessionPayerId, "chat"),
        ]);
        const freeSecondsLeft = freeUsage ? freeUsage.remaining_seconds : 0;

        if (walletBalance <= 0 && freeSecondsLeft <= 0) {
          logger.info(`Chat ${chatId}: payer ${sessionPayerId} balance exhausted (wallet=₹${walletBalance}, free=${freeSecondsLeft}s). Ending session.`);

          // End the session (billing + DB update). endChatSession sends the payer's
          // recharge prompt for every balance_exhausted end, free-only sessions included.
          await chatSessionService.endChatSession(
            chatId,
            io,
            "balance_exhausted",
            "chat.handler.balanceCheck",
            sessionPayerId
          );

          // Block the message from being delivered
          return;
        }
      }
      // ── End balance exhaustion guard ──────────────────────────────────────────

      // Send the message
      const message = await chatService.sendMessage(
        userId,
        receiverId,
        finalContent,
        messageType,
        {
          isReceiverOnline: isOnline,
          isReceiverActiveInChat: isActuallyActiveInChat,
        },
      );

      const roomId = `chat:${chatId}`;

      // Generate URL or data URL for media messages
      let processedContent = message?.content;
      if (
        messageType === "image" ||
        messageType === "video" ||
        messageType === "voice"
      ) {
        try {
          const processedContent = await s3Service.getDownloadUrl(
            message.content,
          );
          // Default to download URL
          // processedContent = downloadUrl;

          // // For images and voice messages, attempt to embed as base64 data URLs
          // if (messageType === "image" || messageType === "voice") {
          //   try {
          //     const contentTypeFromS3 = await s3Service.getContentType(
          //       message.content
          //     );
          //     const fileBuffer = await s3Service.getFileBuffer(message.content);
          //     const base64 = fileBuffer.toString("base64");
          //     processedContent = `data:${contentTypeFromS3};base64,${base64}`;
          //   } catch (err) {
          //     logger.warn("Failed to fetch/encode file from S3, falling back to download URL", err);
          //     processedContent = downloadUrl;
          //   }
          // }

          // For videos, keep download URL to avoid huge base64 payloads
        } catch (err) {
          logger.error(
            "Failed to generate media URL or fetch file from S3:",
            err,
          );
          // fallback to the raw key so client can attempt to resolve
          processedContent = message.content;
        }
      }

      const messagePayload = {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: processedContent,
        messageType: message.messageType,
        isDelivered: message.isDelivered,
        isRead: message.isRead,
        readAt: message.readAt,
        createdAt: message.createdAt,
      };

      // Emit to sender only
      socket.emit("new-message", {
        ...messagePayload,
        sender: "me",
      });

      // Emit to all others in the chat room (excluding sender)
      socket.to(roomId).emit("new-message", {
        ...messagePayload,
        sender: "them",
      });

      // If receiver is online but not in this chat, send notification
      if (isOnline && !isActuallyActiveInChat) {
        // For media messages, send a descriptive content for notifications
        let notificationContent = message.content;
        if (messageType === "image") {
          notificationContent = notificationConstants.CHAT.MEDIA_IMAGE;
        } else if (messageType === "video") {
          notificationContent = notificationConstants.CHAT.MEDIA_VIDEO;
        } else if (messageType === "voice") {
          notificationContent = notificationConstants.CHAT.MEDIA_VOICE;
        }

        io.to(`user:${receiverId}`).emit("new-message-notification", {
          chatId,
          senderId: userId,
          senderName: message.sender.name,
          content: notificationContent,
          messageType: message.messageType,
          createdAt: message.createdAt,
        });
      }

      logger.info(
        `Message sent from ${userId} to ${receiverId} in chat ${chatId}`,
      );

      // --- Response Penalty Tracking ---
      // The message is already delivered; a tracking failure must not report it as failed.
      try {
        if (sender?.role === "user" && receiver?.role === "listener") {
          await penaltyService.startResponseWindow(chatId, userId, receiverId);
        } else if (sender?.role === "listener") {
          await penaltyService.registerResponse(chatId);
        }
      } catch (penaltyError) {
        logger.warn(`Response penalty tracking failed for chat ${chatId}: ${penaltyError.message}`);
      }
      // ---------------------------------
    } catch (error) {
      logger.error(
        `SEND_MESSAGE_FAILED chatId=${data?.chatId} senderId=${userId} receiverId=${data?.receiverId}: ${error.message}`,
        { stack: error.stack },
      );
      socket.emit("error", {
        message: error.isClientSafe ? error.message : "Failed to send message",
        error_code: "SEND_MESSAGE_FAILED",
      });
    } finally {
      // Never leave an acquisition lock behind (it would reject this user's requests for 15s).
      for (const { uId, token } of heldLocks) {
        try {
          await redisService.releaseUserSessionLock(uId, token);
        } catch (releaseError) {
          logger.warn(`Failed to release session lock for ${uId}: ${releaseError.message}`);
        }
      }
    }
  });

  // socket.on("send-message", async (data) => {
  //   try {
  //     const {
  //       chatId,
  //       receiverId,
  //       content,
  //       messageType = "text",
  //       file,
  //       filename,
  //       contentType,
  //     } = data;

  //     let finalContent = content;

  //     // Handle media uploads for image, video, voice
  //     if (
  //       messageType === "image" ||
  //       messageType === "video" ||
  //       messageType === "voice"
  //     ) {
  //       if (!file || !filename) {
  //         socket.emit("error", {
  //           message: "File data or filename missing for media message",
  //         });
  //         return;
  //       }

  //       // Determine folder based on messageType
  //       const folder =
  //         messageType === "image"
  //           ? "chat-images"
  //           : messageType === "video"
  //             ? "chat-videos"
  //             : "chat-voices";

  //       let uploadResult;

  //       if (messageType === "voice") {
  //         // Convert incoming audio to stream/buffer
  //         let converted;
  //         try {
  //           converted = convertIncomingAudioToStream(file);
  //         } catch (err) {
  //           socket.emit("error", {
  //             message: err.message || "Invalid audio input",
  //             code: err.code,
  //           });
  //           return;
  //         }

  //         const {
  //           stream,
  //           buffer,
  //           contentType: inferredContentType,
  //           extension,
  //         } = converted;

  //         // Determine final content type and filename
  //         const finalContentType =
  //           contentType || inferredContentType || "audio/m4a";
  //         const finalExtension =
  //           extension || finalContentType.split("/").pop() || "m4a";
  //         const finalFilename =
  //           filename || generateRandomFilename(finalExtension);

  //         // Upload based on what we have
  //         if (buffer) {
  //           // If we have a buffer, use the buffer upload method (more efficient)
  //           uploadResult = await s3Service.uploadFileToS3(
  //             buffer,
  //             finalFilename,
  //             folder,
  //             finalContentType
  //           );
  //         } else if (stream) {
  //           // If we only have a stream, use the stream upload method
  //           uploadResult = await s3Service.uploadStreamToS3(
  //             stream,
  //             finalFilename,
  //             folder,
  //             finalContentType
  //           );
  //         } else {
  //           socket.emit("error", {
  //             message: "No valid buffer or stream available for upload",
  //           });
  //           return;
  //         }
  //       } else {
  //         // image & video - expected base64 string or Buffer
  //         const fileBuffer = Buffer.isBuffer(file)
  //           ? file
  //           : Buffer.from(file, "base64");

  //         uploadResult = await s3Service.uploadFileToS3(
  //           fileBuffer,
  //           filename,
  //           folder,
  //           contentType || "application/octet-stream"
  //         );
  //       }

  //       if (!uploadResult || !uploadResult.success) {
  //         socket.emit("error", {
  //           message: "Failed to upload media file",
  //         });
  //         return;
  //       }

  //       finalContent = uploadResult.key; // Store only the key
  //     } else {
  //       // For text messages, validate content
  //       if (!finalContent?.trim()) {
  //         socket.emit("error", {
  //           message: "Message content is required",
  //         });
  //         return;
  //       }
  //       finalContent = finalContent.trim();
  //     }

  //     // Validate required fields
  //     if (!chatId || !receiverId) {
  //       socket.emit("error", {
  //         message: "Chat ID and receiver ID are required",
  //       });
  //       return;
  //     }

  //     // Send the message
  //     const message = await chatService.sendMessage(
  //       userId,
  //       receiverId,
  //       finalContent,
  //       messageType
  //     );

  //     const roomId = `chat:${chatId}`;

  //     // Generate URL or data URL for media messages
  //     let processedContent = message?.content;

  //     if (
  //       messageType === "image" ||
  //       messageType === "video" ||
  //       messageType === "voice"
  //     ) {
  //       try {
  //         const downloadUrl = await s3Service.getDownloadUrl(message.content);
  //         processedContent = downloadUrl; // Default to download URL

  //         // For images and voice messages, attempt to embed as base64 data URLs
  //         if (messageType === "image" || messageType === "voice") {
  //           try {
  //             const contentTypeFromS3 = await s3Service.getContentType(
  //               message.content
  //             );
  //             const fileBuffer = await s3Service.getFileBuffer(message.content);
  //             const base64 = fileBuffer.toString("base64");
  //             processedContent = `data:${contentTypeFromS3};base64,${base64}`;
  //           } catch (err) {
  //             logger.warn(
  //               "Failed to fetch/encode file from S3, falling back to download URL",
  //               err
  //             );
  //             processedContent = downloadUrl;
  //           }
  //         }
  //         // For videos, keep download URL to avoid huge base64 payloads
  //       } catch (err) {
  //         logger.error(
  //           "Failed to generate media URL or fetch file from S3:",
  //           err
  //         );
  //         // fallback to the raw key so client can attempt to resolve
  //         processedContent = message.content;
  //       }
  //     }

  //     const messagePayload = {
  //       id: message.id,
  //       chatId: message.chatId,
  //       senderId: message.senderId,
  //       receiverId: message.receiverId,
  //       content: processedContent,
  //       messageType: message.messageType,
  //       isDelivered: message.isDelivered,
  //       isRead: message.isRead,
  //       readAt: message.readAt,
  //       createdAt: message.createdAt,
  //     };

  //     console.log("messagePayload: ", messagePayload);

  //     // Emit to sender only
  //     socket.emit("new-message", {
  //       ...messagePayload,
  //       sender: "me",
  //     });

  //     // Emit to all others in the chat room (excluding sender)
  //     socket.to(roomId).emit("new-message", {
  //       ...messagePayload,
  //       sender: "them",
  //     });

  //     // If receiver is online but not in this chat, send notification
  //     const receiverStatus = await redisService.getUserStatus(receiverId);
  //     const isReceiverActiveInChat = await redisService.isUserActiveInChat(
  //       receiverId,
  //       chatId
  //     );

  //     if (receiverStatus.isOnline && !isReceiverActiveInChat) {
  //       // For media messages, send a descriptive content for notifications
  //       let notificationContent = message.content;
  //       if (messageType === "image") {
  //         notificationContent = notificationConstants.CHAT.MEDIA_IMAGE;
  //       } else if (messageType === "video") {
  //         notificationContent = notificationConstants.CHAT.MEDIA_VIDEO;
  //       } else if (messageType === "voice") {
  //         notificationContent = notificationConstants.CHAT.MEDIA_VOICE;
  //       }

  //       io.to(`user:${receiverId}`).emit("new-message-notification", {
  //         chatId,
  //         senderId: userId,
  //         senderName: message.sender.name,
  //         content: notificationContent,
  //         messageType: message.messageType,
  //         createdAt: message.createdAt,
  //       });
  //     }

  //     logger.info(
  //       `Message sent from ${userId} to ${receiverId} in chat ${chatId}`
  //     );
  //   } catch (error) {
  //     logger.error("Error sending message:", error);
  //     socket.emit("error", {
  //       message: "Failed to send message",
  //       details: error.message,
  //     });
  //   }
  // });

  // Load more messages (pagination)
  socket.on("load-messages", async (data) => {
    try {
      const { chatId, page = 1, limit = 50 } = data;

      const messagesData = await chatService.getChatMessages(
        chatId,
        userId,
        page,
        limit,
      );

      socket.emit("messages-loaded", {
        chatId,
        messages: messagesData.messages,
        hasMore: messagesData.hasMore,
        currentPage: page,
      });
    } catch (error) {
      logger.error("Error loading messages:", error);
      socket.emit("error", { message: "Failed to load messages" });
    }
  });

  // Typing indicators
  socket.on("typing-start", async (data) => {
    try {
      const { chatId } = data;
      await redisService.setUserTyping(chatId, userId, true);

      const roomId = `chat:${chatId}`;
      socket.to(roomId).emit("user-typing", {
        chatId,
        userId,
        isTyping: true,
      });
    } catch (error) {
      logger.error("Error handling typing start:", error);
    }
  });

  socket.on("typing-stop", async (data) => {
    try {
      const { chatId } = data;
      await redisService.setUserTyping(chatId, userId, false);

      const roomId = `chat:${chatId}`;
      socket.to(roomId).emit("user-typing", {
        chatId,
        userId,
        isTyping: false,
      });
    } catch (error) {
      logger.error("Error handling typing stop:", error);
    }
  });

  // Delete message
  socket.on("delete-message", async (data) => {
    try {
      const { messageId, chatId } = data;

      await chatService.deleteMessage(messageId, userId);

      const roomId = `chat:${chatId}`;
      io.to(roomId).emit("message-deleted", {
        messageId,
        chatId,
        deletedBy: userId,
      });

      logger.info(`Message ${messageId} deleted by user ${userId}`);
    } catch (error) {
      logger.error("Error deleting message:", error);
      socket.emit("error", { message: "Failed to delete message" });
    }
  });

  // Search messages
  socket.on("search-messages", async (data) => {
    try {
      const { chatId, query, page = 1, limit = 20 } = data;

      if (!query || query.trim().length < 2) {
        socket.emit("error", {
          message: "Search query must be at least 2 characters",
        });
        return;
      }

      const searchResults = await chatService.searchMessages(
        chatId,
        userId,
        query.trim(),
        page,
        limit,
      );

      socket.emit("search-results", {
        chatId,
        query,
        results: searchResults.messages,
        hasMore: searchResults.hasMore,
        totalCount: searchResults.totalCount,
        currentPage: page,
      });
    } catch (error) {
      logger.error("Error searching messages:", error);
      socket.emit("error", {
        message: error.message || "Failed to search messages",
      });
    }
  });

  // Get user's chats list
  socket.on("get-chats", async (data) => {
    try {
      const { page = 1, limit = 20, roleId } = data || {};
      const roleStr = roles[roleId] || null;

      const chatsData = await chatService.getUserChats(
        userId,
        page,
        limit,
        roleStr,
      );

      socket.emit("chats-loaded", {
        chats: chatsData.chats,
        hasMore: chatsData.hasMore,
        totalCount: chatsData.totalCount,
        currentPage: page,
        roleId: roleId || null,
      });
    } catch (error) {
      logger.error("Error getting chats:", error);
      socket.emit("error", { message: "Failed to load chats" });
    }
  });

  // Mark all inbox notifications as seen
  socket.on("mark-inbox-seen", async () => {
    try {
      // Clear the Redis set
      await redisService.clearAllPendingNotifications(userId);

      // Broadcast to all of the user's active sockets to sync the UI
      io.to(`user:${userId}`).emit("notifications-cleared", {
        clearedAt: new Date()
      });

      logger.info(`User ${userId} marked inbox as seen`);
    } catch (error) {
      logger.error("Error marking inbox as seen:", error);
      socket.emit("error", { message: "Failed to mark inbox as seen" });
    }
  });

  // Handle user going online
  socket.on("user-online", async () => {
    try {
      const { manualOffine } = await redisService.getUserStatus(
        userId,
        socket.user.role,
      );

      if (
        !manualOffine &&
        socket.user.role !== "listener" &&
        socket.user.role !== "astrologer"
      ) {
        await redisService.refreshUserSocket(
          userId,
          socket.id,
          socket.user.role,
        );

        // Mark pending messages as delivered
        const deliveredMessages =
          await chatService.markMessagesAsDelivered(userId);

        // Notify senders that their messages were delivered
        for (const message of deliveredMessages) {
          io.to(`user:${message.senderId}`).emit("message-delivered", {
            messageId: message.id,
            chatId: message.chatId,
            deliveredTo: userId,
            deliveredAt: new Date(),
          });
        }

        // Broadcast online status to relevant users
        emitStatus(socket, "user-status-changed", {
          userId,
          isOnline: true,
          lastSeen: new Date(),
        }, socket.user.role);

        logger.info(`User ${userId} is now online`);
      }
    } catch (error) {
      logger.error("Error handling user online:", error);
    }
  });

  socket.on("user-manual-video-call", async (data) => {
    const { isVideoCall } = data;
    try {
      await redisService.setUserVideoCallStatus(userId, isVideoCall);
    } catch (error) {
      logger.error("Error handling disconnect:", error);
    }
  });

  socket.on("check-video-call-status", async (data) => {
    const { receiverId } = data;
    try {
      const isVideoCall = await redisService.getUserVideoCallStatus(receiverId);
      socket.emit("video-call-status", { isVideoCall });
    } catch (err) {
      logger.error("Error handling check-video-call-status:", err);
      socket.emit("error", { message: "Failed to check video call status" });
    }
  });

  // // send a pop up for request popup

  // socket.on("send-request", async (data) => {
  //   try {
  //     const { chatId, message } = data;
  //     const roomId = `chat:${chatId}`;
  //     io.to(roomId).emit("request-popup", {
  //       chatId,
  //       message,
  //     });
  //   } catch (error) {
  //     logger.error("Error sending request:", error);
  //   }
  // });

  // Listener and astrologer availability is controlled manually.
  socket.on("user-manual-status", async ({ status }) => {
    // check user role
    // only status can online and offline
    if (status !== "online" && status !== "offline") {
      return;
    }
    try {
      const user = await User.findByPk(userId);
      if (user.role !== "listener" && user.role !== "astrologer") {
        return;
      }
      if (status === "offline") {
        await redisService.setUserOffline(userId, "true", socket.user.role);
      } else {
        await redisService.setManualUserOnline(
          userId,
          socket.id,
          socket.user.role,
        );
      }

      const activeChat = await redisService.getUserActiveChat(userId);
      if (activeChat) {
        await redisService.removeUserFromActiveChat(userId, activeChat);
      }

      const conversationService = require("../../services/conversation.service");
      const busyMap = await conversationService.getBusyInfo([userId], io);
      const busyInfo = busyMap.get(userId) || { isBusy: false, type: null };
      const isBusy = busyInfo.isBusy;

      io.emit("user-status-changed", {
        userId,
        role: user.role,
        isOnline: status === "online",
        isBusy,
        lastSeen: new Date(),
        source: "manual-status",
      });

      io.emit("listener:status-changed", {
        listenerId: userId,
        isOnline: status === "online",
        isBusy: isBusy,
        busyType: isBusy ? busyInfo.type : undefined,
      });
    } catch (err) {
      logger.error("Error handling user manual offline:", err);
      socket.emit("error", { message: "Failed to update status" });
    }
  });
};
