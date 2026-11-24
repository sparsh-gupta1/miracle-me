const { Op } = require("sequelize");
const {
  User,
  UserFavorite,
  UserBlockList,
  Chat,
  ChatSetting,
} = require("../models");
const logger = require("../utils/logger");
const chatService = require("../services/chat.service");
const redisService = require("../services/redis.service");
const conversationService = require("../services/conversation.service");

// Socket.IO may not be initialised (tests, startup); busy healing then just skips the broadcast.
function safeIO() {
  try {
    // eslint-disable-next-line global-require
    return require("../config/websocket").getIO();
  } catch (err) {
    return null;
  }
}
const { roles } = require("../utils/CONSTANT");
const s3Service = require("../services/s3.service");
const { getIO } = require("../config/websocket");
exports.getUserChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const chatsData = await chatService.getUserChats(userId, page, limit);

    res.json({
      success: true,
      data: chatsData,
    });
  } catch (error) {
    logger.error("Error fetching chats:", error);
    next(error);
  }
};

exports.getAnotherUserChat = async (req, res, next) => {
  const userId = req.user.id;
  const { receiverId } = req.body;
  try {
    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID is required",
      });
    }

    if (userId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create chat with yourself",
      });
    }

    // Check if receiver exists
    const receiver = await User.findByPk(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const chat = await chatService.getOrCreateChat(userId, receiverId);

    res.json({
      success: true,
      data: {
        chatId: chat.id,
        participant1: chat.participant1,
        participant2: chat.participant2,
        createdAt: chat.createdAt,
      },
    });
  } catch (error) {
    logger.error("Error fetching chats:", error);
    next(error);
  }
};

exports.getMessageInChat = async (req, res, next) => {
  const userId = req.user.id;
  const { chatId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const messagesData = await chatService.getChatMessages(
      chatId,
      userId,
      page,
      limit,
    );
    return res.json({
      success: true,
      data: messagesData,
    });
  } catch (error) {
    logger.error("Error fetching getMessageInChat:", error);
    if (error.message === "Chat not found or access denied") {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

exports.sendMessageInChat = async (req, res, next) => {
  const userId = req.user.id;
  const { chatId } = req.params;
  const { content, messageType = "text", receiverId } = req.body;
  try {
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID is required",
      });
    }

    const io = getIO();
    const receiver = await User.findByPk(receiverId, {
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

    const message = await chatService.sendMessage(
      userId,
      receiverId,
      content.trim(),
      messageType,
      {
        isReceiverOnline: isOnline,
        isReceiverActiveInChat: isActuallyActiveInChat,
      },
    );

    const roomId = `chat:${chatId}`;
    io.to(roomId).emit("new-message", {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      messageType: message.messageType,
      isDelivered: message.isDelivered,
      isRead: message.isRead,
      readAt: message.readAt,
      createdAt: message.createdAt,
      sender: message.sender,
    });

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    logger.error("Error fetching sendMessageInChat:", error);
    next(error);
  }
};

exports.markAsReadMessage = async (req, res, next) => {
  const userId = req.user.id;
  const { chatId } = req.params;
  try {
    const readMessageIds = await chatService.markMessagesAsRead(chatId, userId);
    const io = getIO();

    if (readMessageIds.length > 0) {
      const roomId = `chat:${chatId}`;
      io.to(roomId).emit("messages-read", {
        chatId,
        messageIds: readMessageIds,
        readBy: userId,
        readAt: new Date(),
      });
    }

    res.json({
      success: true,
      data: {
        readMessageCount: readMessageIds.length,
        messageIds: readMessageIds,
      },
    });
  } catch (error) {
    logger.error("Error fetching sendMessageInChat:", error);
    next(error);
  }
};

exports.deleteMessage = async (req, res, next) => {
  const userId = req.user.id;
  const { messageId } = req.params;
  try {
    const result = await chatService.deleteMessage(messageId, userId);
    res.json(result);
  } catch (error) {
    logger.error("Error fetching sendMessageInChat:", error);
    if (error.message === "Message not found or unauthorized") {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

exports.searchMessageInChat = async (req, res, next) => {
  const userId = req.user.id;

  const { chatId } = req.params;
  const { q: query, page = 1, limit = 20 } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 20, 100);
  try {
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
      });
    }

    const searchResults = await chatService.searchMessages(
      chatId,
      userId,
      query.trim(),
      parseInt(page),
      safeLimit,
    );

    res.json({
      success: true,
      data: searchResults,
    });
  } catch (error) {
    logger.error("Error fetching searchMessageInChat:", error);
    next(error);
  }
};

exports.getUserStatusOnline = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: ["id", "role"],
    });

    const [userStatus, busyMap] = await Promise.all([
      redisService.getUserStatus(userId, user?.role || null),
      conversationService.getBusyInfo([userId], safeIO()).catch(() => new Map()),
    ]);
    const busy = busyMap.get(userId) || { isBusy: false, type: null, since: null };

    res.json({
      success: true,
      data: {
        userId,
        isOnline: userStatus.isOnline,
        lastSeen: userStatus.lastSeen,
        isBusy: busy.isBusy,
        busyInfo: busy.isBusy ? { type: busy.type, since: busy.since } : null,
      },
    });
  } catch (error) {
    logger.error("Error fetching getUserStatusOnline:", error);
    next(error);
  }
};

exports.newUserForChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { q: query = "", page = 1, limit = 20, filter = "all" } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const { roleid } = req.params;
    const role = roles[roleid];

    if (role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    const offset = (parseInt(page) - 1) * safeLimit;

    // Get list of users blocked by current user and users who blocked current user
    const [blockedByUserRecords, blockingUserRecords] = await Promise.all([
      UserBlockList.findAll({
        where: { userId },
        attributes: ["blockedUserId"],
      }),
      UserBlockList.findAll({
        where: { blockedUserId: userId },
        attributes: ["userId"],
      }),
    ]);

    const blockedByUserIds = blockedByUserRecords.map((r) => r.blockedUserId);
    const blockingUserIds = blockingUserRecords.map((r) => r.userId);
    const allInvolvedInBlockIds = [
      ...new Set([...blockedByUserIds, ...blockingUserIds]),
    ];

    const where = {
      id: { [Op.not]: userId },
      role,
    };

    if (query?.trim()) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${query.trim()}%` } },
        { email: { [Op.iLike]: `%${query.trim()}%` } },
      ];
    }

    if (filter === "fav") {
      const favorites = await UserFavorite.findAll({
        where: { userId },
        attributes: ["favoriteUserId"],
      });
      const favoriteUserIds = favorites.map((f) => f.favoriteUserId);

      // Filter by favorites AND exclude any blocked users
      const allowedFavIds = favoriteUserIds.filter(
        (id) => !allInvolvedInBlockIds.includes(id),
      );
      where.id = { [Op.in]: allowedFavIds };
    } else if (filter === "blocked") {
      // Show only users blocked by the current user
      where.id = { [Op.in]: blockedByUserIds };
    } else {
      // "all" filter: Exclude self and any users involved in a block relationship.
      const excludedUserIds = [...new Set([userId, ...allInvolvedInBlockIds])];
      where.id =
        excludedUserIds.length === 1
          ? { [Op.not]: userId }
          : { [Op.notIn]: excludedUserIds };
    }

    const shouldSkipCount = !query?.trim() && filter === "all";

    if (shouldSkipCount) {
      const rows = await User.findAll({
        where,
        attributes: [
          "id",
          "name",
          "email",
          "role",
          "isOnline",
          "manualOffline",
          "lastSeen",
          "profileImage",
          "isVideoCallAvailable",
          "rating",
        ],
        limit: safeLimit + 1,
        offset,
        order: [
          ["isOnline", "DESC"],
          ["name", "ASC"],
        ],
      });

      const hasMore = rows.length > safeLimit;
      const paginatedRows = rows.slice(0, safeLimit);

      const busyById = await conversationService.getBusyInfo(paginatedRows.map((u) => u.id), safeIO());
      const usersData = await Promise.all(
        paginatedRows.map(async (user) => {
          const [status, favRecord, blockedRecord, chat] = await Promise.all([
            redisService.getUserStatus(user.id, user.role, user),
            UserFavorite.findOne({
              where: { userId, favoriteUserId: user.id },
            }),
            UserBlockList.findOne({
              where: { userId, blockedUserId: user.id },
            }),
            Chat.findOne({
              where: {
                [Op.or]: [
                  { participant1Id: userId, participant2Id: user.id },
                  { participant1Id: user.id, participant2Id: userId },
                ],
              },
              include: [
                {
                  model: ChatSetting,
                  as: "chatSettings",
                  where: { userId },
                  required: false,
                },
              ],
            }),
          ]);

          const customNickname = chat?.chatSettings?.customNickname;
          let profileImage = user.profileImage;
          if (profileImage) {
            try {
              profileImage = await s3Service.getDownloadUrl(profileImage);
            } catch (err) {
              logger.warn(`Failed to sign profile image for ${user.id}`, err);
            }
          }

          const busy = busyById.get(user.id) || { isBusy: false, type: null, since: null };

          return {
            id: user.id,
            name: customNickname || user.name || "anonymous user",
            email: user.email,
            description: "user.description",
            image: profileImage,
            isOnline: status.isOnline,
            lastSeen: status.lastSeen || user.lastSeen,
            isBusy: busy.isBusy,
            busyInfo: busy.isBusy ? { type: busy.type, since: busy.since } : null,
            isFavorite: !!favRecord,
            isBlocked: !!blockedRecord,
            customNickname: customNickname || null,
            isVideoCallAvailable: user.isVideoCallAvailable,
            rating: user.rating,
          };
        }),
      );

      res.json({
        success: true,
        data: {
          users: usersData,
          totalCount: offset + usersData.length,
          hasMore,
        },
      });
      return;
    }

    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "isOnline",
        "manualOffline",
        "lastSeen",
        "profileImage",
        "isVideoCallAvailable",
        "rating",
      ],
      limit: safeLimit,
      offset,
      order: [
        ["isOnline", "DESC"],
        ["name", "ASC"],
      ],
    });

    // Get real-time status, favorites and nicknames
    const busyById = await conversationService.getBusyInfo(rows.map((u) => u.id), safeIO());
    const usersData = await Promise.all(
      rows.map(async (user) => {
        const [status, favRecord, blockedRecord, chat] = await Promise.all([
          redisService.getUserStatus(user.id, user.role, user),
          UserFavorite.findOne({ where: { userId, favoriteUserId: user.id } }),
          UserBlockList.findOne({ where: { userId, blockedUserId: user.id } }),
          Chat.findOne({
            where: {
              [Op.or]: [
                { participant1Id: userId, participant2Id: user.id },
                { participant1Id: user.id, participant2Id: userId },
              ],
            },
            include: [
              {
                model: ChatSetting,
                as: "chatSettings",
                where: { userId },
                required: false,
              },
            ],
          }),
        ]);

        const customNickname = chat?.chatSettings?.customNickname;
        let profileImage = user.profileImage;
        if (profileImage) {
          try {
            profileImage = await s3Service.getDownloadUrl(profileImage);
          } catch (err) {
            logger.warn(`Failed to sign profile image for ${user.id}`, err);
          }
        }

        const busy = busyById.get(user.id) || { isBusy: false, type: null, since: null };

        return {
          id: user.id,
          name: customNickname || user.name || "anonymous user",
          email: user.email,
          description: "user.description",
          image: profileImage,
          isOnline: status.isOnline,
          lastSeen: status.lastSeen || user.lastSeen,
          isBusy: busy.isBusy,
          busyInfo: busy.isBusy ? { type: busy.type, since: busy.since } : null,
          isFavorite: !!favRecord,
          isBlocked: !!blockedRecord,
          chatId: chat?.id || null,
          customNickname: customNickname || null,
          isVideoCallAvailable: user.isVideoCallAvailable,
          rating: user.rating,
        };
      }),
    );

    res.json({
      success: true,
      data: {
        users: usersData,
        totalCount: count,
        hasMore: offset + parseInt(limit) < count,
      },
    });
  } catch (error) {
    logger.error("Error in newUserForChat:", error);
    next(error);
  }
};

exports.getUnreadMessageCount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const unreadCounts = await redisService.getAllUnreadCounts(userId);

    res.json({
      success: true,
      data: unreadCounts,
    });
  } catch (error) {
    logger.error("Error fetching sendMessageInChat:", error);
    next(error);
  }
};

exports.uploadMedia = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { chatId, receiverId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file provided",
      });
    }

    const mediaType = file.mimetype.split("/")[0] || "media";
    const result = await s3Service.uploadFileToS3(
      file.buffer,
      file.originalname,
      `chats/${chatId}/${receiverId}/${mediaType}/${userId}`,
      file.mimetype,
    );

    const content = result.key;

    if (!chatId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: "Invalid chatId or receiverId",
      });
    }

    // Determine if receiver is online and active in chat (with Socket.io fallback)
    const io = getIO();
    const receiver = await User.findByPk(receiverId, {
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

    // Send the message (Service now handles enum mapping)
    const message = await chatService.sendMessage(
      userId,
      receiverId,
      content,
      mediaType,
      {
        isReceiverOnline: isOnline,
        isReceiverActiveInChat: isActuallyActiveInChat,
      },
    );

    const roomId = `chat:${chatId}`;
    const downloadContent = await s3Service.getDownloadUrl(message.content);

    const messagePayload = {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: downloadContent,
      messageType: message.messageType,
      isDelivered: message.isDelivered,
      isRead: message.isRead,
      readAt: message.readAt,
      createdAt: message.createdAt,
    };

    io.to(`user:${userId}`).emit("new-message", {
      ...messagePayload,
      sender: "me",
    });

    if (isActuallyActiveInChat) {
      // Receiver is inside the chat screen
      io.to(`user:${receiverId}`).emit("new-message", {
        ...messagePayload,
        sender: "them",
      });
    }
    // else if (isOnline) {
    //   // Receiver is online but NOT inside this chat
    //   io.to(`user:${receiverId}`).emit("new-message-notification", {
    //     chatId,
    //     senderId: userId,
    //     senderName: message.sender?.name,
    //     content:
    //       messageType === "image"
    //         ? "📷 Image"
    //         : messageType === "video"
    //           ? "🎥 Video"
    //           : messageType === "voice"
    //             ? "🎵 Voice message"
    //             : messagePayload.content,
    //     messageType,
    //     createdAt: message.createdAt,
    //   });
    // }

    res.json({
      success: true,
      data: {
        url: downloadContent,
        message: messagePayload,
      },
    });
  } catch (error) {
    logger.error("Error fetching sendMessageInChat:", error);
    next(error);
  }
};
