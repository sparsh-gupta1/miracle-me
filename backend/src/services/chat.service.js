// services/chat.service.js
const { Chat, Message, User, ChatParticipant, ChatSetting, UserFavorite } = require("../models");
const redisService = require("./redis.service");
const s3Service = require("./s3.service");
const logger = require("../utils/logger");
const { assertCanCommunicate } = require("../utils/communicationRules");
const { Op } = require("sequelize");

class ChatService {
  // Create or get existing chat between two users
  async getOrCreateChat(user1Id, user2Id) {
    console.log("user1Id, user2Id", user1Id, user2Id);

    try {
      // Validate that both users exist before proceeding
      const [user1, user2] = await Promise.all([
        User.findByPk(user1Id),
        User.findByPk(user2Id),
      ]);

      if (!user1) {
        throw new Error(`User with ID ${user1Id} does not exist`);
      }
      if (!user2) {
        throw new Error(`User with ID ${user2Id} does not exist`);
      }

      assertCanCommunicate(user1.role, user2.role);

      // Note: User can communicate with Practitioner, 
      // and Practitioner can communicate with their own peer (L-L, A-A).

      // Ensure consistent ordering to prevent duplicate chats
      const [participant1Id, participant2Id] = [user1Id, user2Id].sort();

      let chat = await Chat.findOne({
        where: {
          [Op.or]: [
            { participant1Id, participant2Id },
            { participant1Id: participant2Id, participant2Id: participant1Id },
          ],
        },
        include: [
          { model: User, as: "participant1" },
          { model: User, as: "participant2" },
        ],
      });

      if (!chat) {
        chat = await Chat.create({
          participant1Id,
          participant2Id,
          serviceType: "chat",
        });

        // Create ChatParticipant records
        await Promise.all([
          ChatParticipant.create({ chatId: chat.id, userId: participant1Id }),
          ChatParticipant.create({ chatId: chat.id, userId: participant2Id }),
        ]);

        // Reload with associations
        chat = await Chat.findByPk(chat.id, {
          include: [
            { model: User, as: "participant1" },
            { model: User, as: "participant2" },
          ],
        });
      }

      return chat;
    } catch (error) {
      logger.error("Error in getOrCreateChat:", error);
      throw error;
    }
  }

  // Send a message
  async sendMessage(
    senderId,
    receiverId,
    content,
    messageType = "text",
    options = {}
  ) {
    console.log("messageType", messageType);

    try {
      // Map input messageType to valid database enum values
      let finalMessageType = messageType;
      if (messageType === "audio" || messageType === "voice") {
        finalMessageType = "voice";
      } else if (messageType === "video") {
        finalMessageType = "video";
      } else if (messageType === "image" || messageType === "media") {
        finalMessageType = "image";
      } else if (messageType === "application" || messageType === "document" || messageType === "file") {
        finalMessageType = "file";
      } else if (messageType === "text" || !messageType) {
        finalMessageType = "text";
      }

      if (!["text", "image", "file", "video", "voice"].includes(finalMessageType)) {
        const typeError = new Error(`Unsupported message type: ${messageType}`);
        typeError.isClientSafe = true;
        throw typeError;
      }

      const {
        isReceiverOnline: providedOnline,
        isReceiverActiveInChat: providedActive,
      } = options;

      // Get or create chat
      const chat = await this.getOrCreateChat(senderId, receiverId);

      // Create message
      const message = await Message.create({
        chatId: chat.id,
        senderId,
        receiverId,
        content,
        messageType: finalMessageType,
        isDelivered: false,
        isRead: false,
      });

      // Update chat's last message time
      await Chat.update(
        { lastMessageAt: new Date() },
        { where: { id: chat.id } }
      );

      // Determine receiver status (use provided values or fall back to Redis)
      let isReceiverActiveInChat = providedActive;
      if (isReceiverActiveInChat === undefined) {
        isReceiverActiveInChat = await redisService.isUserActiveInChat(
          receiverId,
          chat.id
        );
      }

      let isReceiverOnline = providedOnline;
      if (isReceiverOnline === undefined) {
        const receiver = await User.findByPk(receiverId, {
          attributes: ["id", "role"],
        });
        const receiverStatus = await redisService.getUserStatus(
          receiverId,
          receiver?.role,
        );
        isReceiverOnline = receiverStatus.isOnline;
      }

      // If receiver is online, mark as delivered
      if (isReceiverOnline) {
        message.isDelivered = true;
      }

      // If receiver is active in chat, mark as read immediately
      if (isReceiverActiveInChat) {
        message.isRead = true;
        message.readAt = new Date();

        // Update ChatParticipant's last read message
        await ChatParticipant.update(
          { lastReadMessageId: message.id },
          {
            where: {
              chatId: chat.id,
              userId: receiverId,
            },
          }
        );
      } else {
        // Increment unread count if receiver is not active in chat.
        // Best effort: the message is already stored, so a Redis hiccup must not fail the send.
        try {
          await redisService.incrementUnreadCount(receiverId, chat.id);
        } catch (redisError) {
          logger.warn(`Failed to increment unread count for chat ${chat.id}: ${redisError.message}`);
        }
      }

      await message.save();

      // Cache the message in Redis (best effort, same reason as above)
      try {
        await redisService.cacheMessage(message);
      } catch (redisError) {
        logger.warn(`Failed to cache message ${message.id}: ${redisError.message}`);
      }

      // Load message with sender info
      const messageWithSender = await Message.findByPk(message.id, {
        include: [
          { model: User, as: "sender", attributes: ["id", "name"] },
          { model: User, as: "receiver", attributes: ["id", "name"] },
        ],
      });

      return messageWithSender;
    } catch (error) {
      logger.error("Error in sendMessage:", error);
      throw error;
    }
  }

  // Get chat messages with pagination
  async getChatMessages(chatId, userId, page = 1, limit = 50) {
    try {
      // Verify user is participant in this chat
      const chat = await Chat.findOne({
        where: {
          id: chatId,
          [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
        },
      });

      if (!chat) {
        throw new Error("Chat not found or access denied");
      }

      const offset = (page - 1) * limit;

      const messages = await Message.findAndCountAll({
        where: { chatId, isRead: { [Op.eq]: false }, isDeleted: false },
        include: [
          { model: User, as: "sender", attributes: ["id", "name"] },
          { model: User, as: "receiver", attributes: ["id", "name"] },
        ],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });
      let resposneMessage = [];
      if (messages.count !== 0) {
        // Process messages to generate URLs for media content
        resposneMessage = await Promise.all(
          messages.rows.reverse().map(async (message) => {
            let processedContent = message.content;
            if (
              message.messageType === "image" ||
              message.messageType === "video" ||
              message.messageType === "voice"
            ) {
              try {
                const contentTypeFromS3 = await s3Service.getContentType(
                  message.content
                );
                const fileBuffer = await s3Service.getFileBuffer(
                  message.content
                );
                const base64 = fileBuffer.toString("base64");
                processedContent = `data:${contentTypeFromS3};base64,${base64}`;
              } catch (error) {
                logger.error(
                  `Failed to generate URL for message ${message.id}:`,
                  error
                );
                // Keep the key as fallback
              }
            }
            return {
              ...message.dataValues,
              content: processedContent,
              sender: message.sender.id === userId ? "me" : "them",
            };
          })
        );
      }

      return {
        messages: resposneMessage, // Reverse to show oldest first
        totalCount: messages.count,
        hasMore: offset + limit < messages.count,
      };
    } catch (error) {
      logger.error("Error in getChatMessages:", error);
      throw error;
    }
  }

  // Mark messages as read when user enters chat
  async markMessagesAsRead(chatId, userId) {
    try {
      // Get all unread messages for this user in this chat
      const unreadMessages = await Message.findAll({
        where: {
          chatId,
          receiverId: userId,
          isRead: false,
        },
        order: [["createdAt", "ASC"]],
      });

      if (unreadMessages.length === 0) {
        return [];
      }

      // Mark all messages as read
      await Message.update(
        {
          isRead: true,
          readAt: new Date(),
        },
        {
          where: {
            chatId,
            receiverId: userId,
            isRead: false,
          },
        }
      );

      // Update ChatParticipant's last read message to the latest one
      const latestMessage = unreadMessages[unreadMessages.length - 1];
      await ChatParticipant.update(
        { lastReadMessageId: latestMessage.id },
        {
          where: {
            chatId,
            userId,
          },
        }
      );

      // Reset unread count in Redis
      await redisService.resetUnreadCount(userId, chatId);

      return unreadMessages.map((msg) => msg.id);
    } catch (error) {
      logger.error("Error in markMessagesAsRead:", error);
      throw error;
    }
  }

  // Get user's chats with last message and unread count
  async getUserChats(userId, page = 1, limit = 20, role = null) {
    try {
      const offset = (page - 1) * limit;

      const where = {
        [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
      };

      // If role filter is provided, we need to ensure the OTHER participant has that role
      if (role) {
        where[Op.and] = [
          {
            [Op.or]: [
              {
                [Op.and]: [
                  { participant1Id: userId },
                  { "$participant2.role$": role }
                ]
              },
              {
                [Op.and]: [
                  { participant2Id: userId },
                  { "$participant1.role$": role }
                ]
              }
            ]
          }
        ];
      }

      // First, get the chats and participant information
      const chats = await Chat.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: "participant1",
            attributes: ["id", "name", "isOnline", "manualOffline", "lastSeen", "profileImage", "role", "isVideoCallAvailable"],
          },
          {
            model: User,
            as: "participant2",
            attributes: ["id", "name", "isOnline", "manualOffline", "lastSeen", "profileImage", "role", "isVideoCallAvailable"],
          },
          {
            model: ChatSetting,
            as: "chatSettings",
            where: { userId },
            required: false,
          },
        ],
        order: [["lastMessageAt", "DESC"]],
        limit,
        offset,
        distinct: true,
      });

      // Get unread counts from Redis
      const unreadCounts = await redisService.getAllUnreadCounts(userId);
      
      // Get pending notifications
      const pendingNotifications = await redisService.getPendingNotifications(userId);
      const pendingSet = new Set(pendingNotifications || []);

      // Get all favorite user IDs for this user
      const favorites = await UserFavorite.findAll({
        where: { userId },
        attributes: ["favoriteUserId"],
      });
      const favoriteUserIds = new Set(favorites.map((f) => f.favoriteUserId));

      // Fetch last messages for these chats separately to avoid massive joins
      const formattedChats = await Promise.all(
        chats.rows.map(async (chat) => {
          const otherParticipant =
            chat.participant1Id === userId
              ? chat.participant2
              : chat.participant1;

          // Get the last message for this chat
          const lastMessage = await Message.findOne({
            where: { chatId: chat.id },
            order: [["createdAt", "DESC"]],
            include: [{ model: User, as: "sender", attributes: ["id", "name"] }],
          });

          // Get real-time online status from Redis
          const userStatus = await redisService.getUserStatus(
            otherParticipant.id,
            otherParticipant.role,
            otherParticipant,
          );

          // Get custom nickname if exists
          const customNickname = chat.chatSettings?.customNickname;

          // Profile image with signed URL
          let profileImage = otherParticipant.profileImage;
          if (profileImage) {
            try {
              profileImage = await s3Service.getDownloadUrl(profileImage);
            } catch (err) {
              logger.warn(`Failed to sign profile image for ${otherParticipant.id}`, err);
            }
          }

          return {
            id: chat.id,
            participant: {
              id: otherParticipant.id,
              name: customNickname || otherParticipant.name || "anonymous user",
              role: otherParticipant.role,
              isOnline: userStatus.isOnline,
              lastSeen: userStatus.lastSeen || otherParticipant.lastSeen,
              profileImage,
              customNickname: customNickname || null,
              isVideoCallAvailable: otherParticipant.isVideoCallAvailable,
            },
            lastMessage: lastMessage || null,
            unreadCount: unreadCounts[chat.id] || 0,
            updatedAt: chat.lastMessageAt || chat.updatedAt,
            fav: favoriteUserIds.has(otherParticipant.id),
            isFavorite: favoriteUserIds.has(otherParticipant.id),
            is_notify: pendingSet.has(chat.id),
          };
        })
      );

      return {
        chats: formattedChats,
        totalCount: chats.count,
        hasMore: offset + limit < chats.count,
      };
    } catch (error) {
      logger.error("Error in getUserChats:", error);
      throw error;
    }
  }

  // Mark messages as delivered when user comes online
  async markMessagesAsDelivered(userId) {
    try {
      // Find only undelivered messages for this user
      const undeliveredMessages = await Message.findAll({
        where: {
          receiverId: userId,
          isDelivered: false,
        },
        attributes: ["id", "senderId", "chatId"],
        include: [{ model: User, as: "sender", attributes: ["id"] }],
      });

      if (undeliveredMessages.length === 0) {
        return [];
      }

      // Extract IDs and update them
      const messageIds = undeliveredMessages.map((msg) => msg.id);
      await Message.update(
        { isDelivered: true },
        {
          where: {
            id: { [Op.in]: messageIds },
          },
        }
      );

      return undeliveredMessages;
    } catch (error) {
      logger.error("Error in markMessagesAsDelivered:", error);
      throw error;
    }
  }

  // Delete a message (soft delete or hard delete based on requirements)
  async deleteMessage(messageId, userId) {
    try {
      const message = await Message.findOne({
        where: {
          id: messageId,
          senderId: userId, // Only sender can delete their message
        },
      });

      if (!message) {
        throw new Error("Message not found or unauthorized");
      }

      // Soft delete
      message.isDeleted = true;
      await message.save();

      return { success: true };
    } catch (error) {
      logger.error("Error in deleteMessage:", error);
      throw error;
    }
  }

  // Search messages in a chat
  async searchMessages(chatId, userId, query, page = 1, limit = 20) {
    try {
      // Verify user access to chat
      const chat = await Chat.findOne({
        where: {
          id: chatId,
          [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
        },
      });

      if (!chat) {
        throw new Error("Chat not found or access denied");
      }

      const offset = (page - 1) * limit;

      const messages = await Message.findAndCountAll({
        where: {
          chatId,
          content: {
            [Op.iLike]: `%${query}%`,
          },
          isDeleted: false,
        },
        include: [{ model: User, as: "sender", attributes: ["id", "name"] }],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      // Process messages to generate URLs for media content
      const processedMessages = await Promise.all(
        messages.rows.map(async (message) => {
          let processedContent = message.content;
          if (
            message.messageType === "image" ||
            message.messageType === "video" ||
            message.messageType === "voice"
          ) {
            try {
              processedContent = await s3Service.getDownloadUrl(
                message.content
              );
            } catch (error) {
              logger.error(
                `Failed to generate URL for message ${message.id}:`,
                error
              );
              // Keep the key as fallback
            }
          }
          return {
            ...message.dataValues,
            content: processedContent,
          };
        })
      );

      return {
        messages: processedMessages,
        totalCount: messages.count,
        hasMore: offset + limit < messages.count,
      };
    } catch (error) {
      logger.error("Error in searchMessages:", error);
      throw error;
    }
  }
}

module.exports = new ChatService();
