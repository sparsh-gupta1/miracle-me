const { Op } = require("sequelize");
const {
  User,
  Chat,
  ChatSetting,
  UserBlockList,
  UserFavorite,
  Wallet,
  WalletTransaction,
  Transaction,
} = require("../models");
const { roles } = require("../utils/CONSTANT");
const logger = require("../utils/logger");
const s3Service = require("./s3.service");
const redisService = require("./redis.service");
const pricingService = require("./pricing.service");

class UserService {
  constructor() {}
  async getAllUsers(userId) {
    const users = await User.findByPk(userId, {
      exclude: ["password", "updatedAt", "googleId", "otpExpiry", "otp"],
    });
    if (!users) {
      throw new Error("User not found");
    }

    if (users.profileImage) {
      try {
        users.profileImage = await s3Service.getDownloadUrl(users.profileImage);
      } catch (err) {
        console.error(
          `Error generating signed URL for ${users.profileImage}:`,
          err,
        );
        users.profileImage = null; // Fallback
      }
    }
    return users;
  }

  /** Customer-facing self profile. Birth details live in users.profile. */
  _toMe(user) {
    const profile = user.profile || {};
    return {
      id: user.id,
      role: user.role,
      name: user.name,
      mobileNumber: user.mobileNumber,
      gender: profile.gender || null,
      dateOfBirth: profile.dateOfBirth || null,
      birthTime: profile.birthTime || null,
      birthPlace: profile.birthPlace || null,
    };
  }

  async getMe(userId) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error("User not found");
    return this._toMe(user);
  }

  async updateMe(userId, { name, gender, dateOfBirth, birthTime, birthPlace }) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error("User not found");
    if (name !== undefined) user.name = String(name).trim();
    const profile = { ...(user.profile || {}) };
    if (gender !== undefined) profile.gender = gender;
    if (dateOfBirth !== undefined) profile.dateOfBirth = dateOfBirth;
    if (birthTime !== undefined) profile.birthTime = birthTime;
    if (birthPlace !== undefined) profile.birthPlace = birthPlace;
    user.profile = profile;
    user.changed("profile", true);
    await user.save();
    return this._toMe(user);
  }

  async changeUserNameByChatId(chatId, userId, customNickname) {
    const chat = await Chat.findOne({
      where: {
        id: chatId,
        [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
      },
    });
    if (!chat) {
      throw new Error("Chat not found or access denied");
    }

    let [ChatSet, created] = await ChatSetting.findOrCreate({
      where: {
        chatId,
        userId,
      },
      defaults: {
        customNickname,
      },
    });

    ChatSet.customNickname = customNickname;
    await ChatSet.save();

    return ChatSet;
  }

  async blockUserByUserID(blockedUserId, userId, isBlock) {
    const user = await User.findByPk(blockedUserId, {
      exclude: ["password", "updatedAt", "googleId", "otpExpiry", "otp"],
    });
    if (!user) {
      throw new Error("User not found");
    }
    if (isBlock) {
      await UserBlockList.destroy({
        where: {
          userId,
          blockedUserId,
        },
      });
    } else {
      await UserBlockList.upsert({
        userId,
        blockedUserId,
      });
    }
    return;
  }

  async blockUserList(userId) {
    const blockedUserList = await UserBlockList.findAll({
      where: {
        userId,
      },
      include: {
        model: User,
        as: "blockedUsers",
        attributes: ["name"],
      },
    });
    const blockedUserIds = blockedUserList.map((user) => user.blockedUserId);

    const findAllChat = await Chat.findAll({
      where: {
        [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
        [Op.or]: [
          { participant1Id: { [Op.in]: blockedUserIds } },
          { participant2Id: { [Op.in]: blockedUserIds } },
        ],
      },
      require: false,
      include: [
        {
          model: ChatSetting,
          as: "chatSettings",
          where: {
            userId,
          },
        },
      ],
    });

    const response = blockedUserList.flatMap((data) => {
      const {
        blockedUsers: { name },
        blockedUserId,
        createdAt,
      } = data;
      let payload = {
        name: name || "anonymous user",
        createdAt,
      };

      const logUser = findAllChat.find(
        (user) =>
          (user.participant1Id === blockedUserId ||
            user.participant2Id === blockedUserId) &&
          user.chatSettings !== null,
      );
      if (logUser) {
        payload.name = logUser?.chatSettings?.customNickname;
      }

      return payload;
    });

    return response;
  }

  async getChatReceiverProfile(receiverId) {
    try {
      const user = await User.findByPk(receiverId, {
        exclude: ["password", "updatedAt", "googleId", "otpExpiry", "otp"],
      });
      if (!user) {
        throw new Error("User not found");
      }
      return user;
    } catch (error) {
      throw error;
    }
  }

  // dashaboard user service
  async getUserRoleWise(roleid, filters) {
    const { page, limit, search, sortBy, order: sortOrder, hasRecharged } = filters;
    const offset = (page - 1) * limit;

    // NULLS LAST keeps users without a lastLogin/rating/age at the end in both directions.
    // id is a tie-breaker so paging is stable when many rows share the sort value.
    const order = [
      [sortBy, `${sortOrder.toUpperCase()} NULLS LAST`],
      ["id", "ASC"],
    ];
    const where = {
      role: roles[roleid],
    };

    if (search) {
      // search by name or mobile number
      where[Op.or] = [
        {
          name: { [Op.iLike]: `%${search}%` },
        },
        {
          mobileNumber: { [Op.iLike]: `%${search}%` },
        },
      ];
    }

    if (hasRecharged !== undefined) {
      // A user has recharged if they have at least one completed payment transaction.
      const t = Transaction.getTableName();
      const userIdCol = Transaction.rawAttributes.userId.field || "userId";
      const statusCol = Transaction.rawAttributes.status.field || "status";
      // findAndCountAll aliases the users table by the model name ("User").
      const userAlias = User.name;
      where[Op.and] = [
        User.sequelize.literal(
          `${hasRecharged ? "" : "NOT "}EXISTS (SELECT 1 FROM "${t}" AS t WHERE t."${userIdCol}" = "${userAlias}"."id" AND t."${statusCol}" = 'completed')`,
        ),
      ];
    }
    const { rows, count } = await User.findAndCountAll({
      where,
      offset,
      limit,
      order,
      attributes: {
        exclude: ["password", "googleId", "otp", "otpExpiry"],
      },
    });

    // Use signed URLs instead of Base64 for better performance
    const role = roles[roleid];
    const enhancedRows = await Promise.all(
      rows.map(async (user) => {
        const plainUser = user.toJSON();

        // Profile image signed URL
        if (plainUser.profileImage) {
          try {
            plainUser.profileImage = await s3Service.getDownloadUrl(
              plainUser.profileImage,
            );
          } catch (err) {
            console.error(
              `Error generating signed URL for ${plainUser.profileImage}:`,
              err,
            );
            plainUser.profileImage = null; // Fallback
          }
        }

        // Days since registration
        plainUser.daysSinceRegistered = Math.floor(
          (Date.now() - new Date(plainUser.createdAt).getTime()) /
            (1000 * 60 * 60 * 24),
        );

        // Financial stats
        const stats = await this._getUserFinancialStats(plainUser.id, role);
        plainUser.totalSpent = stats.totalSpent;
        plainUser.totalEarned = stats.totalEarned;

        return plainUser;
      }),
    );
    return {
      users: enhancedRows,
      total: count,
      page,
      limit,
    };
  }

  /**
   * Private helper — aggregates total spent (debit on main wallet) and
   * total earned (credit on earning wallet) for a given user.
   * totalEarned is null for the 'user' role.
   */
  async _getUserFinancialStats(userId, role) {
    try {
      // Find the user's main wallet
      const mainWallet = await Wallet.findOne({
        where: { userId, type: "main" },
        attributes: ["id"],
      });

      let totalSpent = 0;
      if (mainWallet) {
        const spentResult = await WalletTransaction.findOne({
          where: { walletId: mainWallet.id, type: "debit" },
          attributes: [
            [
              WalletTransaction.sequelize.fn(
                "COALESCE",
                WalletTransaction.sequelize.fn(
                  "SUM",
                  WalletTransaction.sequelize.col("amount"),
                ),
                0,
              ),
              "total",
            ],
          ],
          raw: true,
        });
        totalSpent = parseFloat(spentResult?.total ?? 0);
      }

      let totalEarned = null;
      if (role === "listener" || role === "astrologer") {
        const earningWallet = await Wallet.findOne({
          where: { userId, type: "earning" },
          attributes: ["id"],
        });
        if (earningWallet) {
          const earnedResult = await WalletTransaction.findOne({
            where: { walletId: earningWallet.id, type: "credit" },
            attributes: [
              [
                WalletTransaction.sequelize.fn(
                  "COALESCE",
                  WalletTransaction.sequelize.fn(
                    "SUM",
                    WalletTransaction.sequelize.col("amount"),
                  ),
                  0,
                ),
                "total",
              ],
            ],
            raw: true,
          });
          totalEarned = parseFloat(earnedResult?.total ?? 0);
        } else {
          totalEarned = 0;
        }
      }

      return { totalSpent, totalEarned };
    } catch (err) {
      console.error(`Error fetching financial stats for user ${userId}:`, err);
      return { totalSpent: 0, totalEarned: null };
    }
  }

  // active inactive user service
  async activeInactiveUser(userId, isActive) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }
    user.isActive = !user.isActive;
    await user.save();
    // A deactivated user must not keep using tokens issued before the change.
    if (!user.isActive) {
      await this.forceLogout(userId);
    }
    return user;
  }

  /**
   * Log a user out of every device: revoke all existing access/refresh tokens,
   * clear their push token (and take listeners offline), and disconnect live sockets.
   * @param {string} userId - User to log out
   * @param {string} [adminId] - Admin performing the action, for the audit log
   */
  async forceLogout(userId, adminId = null) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    const user = isUuid ? await User.findByPk(userId, { attributes: ["id", "role"] }) : null;
    if (!user) {
      const err = new Error("User not found");
      err.name = "NotFoundError";
      throw err;
    }

    // Bumping the version makes every token issued so far fail authentication.
    await User.increment("tokenVersion", { where: { id: userId } });

    // Same cleanup as a normal logout: clears the FCM token and sets listeners offline.
    const authService = require("./auth.service");
    await authService.logout(userId);

    let disconnectedSockets = 0;
    try {
      const { getIO } = require("../config/websocket");
      const io = getIO();
      const room = `user:${userId}`;
      disconnectedSockets = (await io.in(room).fetchSockets()).length;
      io.to(room).emit("auth:force-logout", { reason: "logged_out_by_admin" });
      io.in(room).disconnectSockets(true);
    } catch (err) {
      // Socket.io is not initialized in some contexts (tests, scripts)
    }

    logger.warn(`Admin ${adminId || "system"} force-logged-out user ${userId} (${disconnectedSockets} live sockets)`);
    return { userId, role: user.role, disconnectedSockets };
  }

  /**
   * One active account per mobile number, whatever the role. Login looks users up by
   * mobile number only, so a second active account on the same number (e.g. a user and a
   * listener) makes login pick one of them arbitrarily.
   * @param {string} mobileNumber
   * @param {string} [excludeUserId] - The account being edited, which may keep its own number
   */
  async assertMobileNumberAvailable(mobileNumber, excludeUserId = null) {
    const where = { mobileNumber, isActive: true };
    if (excludeUserId) where.id = { [Op.ne]: excludeUserId };

    const existingUser = await User.findOne({ where, attributes: ["id", "role"] });
    if (existingUser) {
      throw new Error(`This mobile number is already registered as a ${existingUser.role}`);
    }
  }

  // create atrologer and listener user by admin

  async adminCreateUser({
    name,
    mobileNumber,
    profileImage,
    profile,
    roleid,
    age,
    language,
    rating,
  }) {
    if (!profileImage) {
      throw new Error("Profile image is required");
    }

    await this.assertMobileNumberAvailable(mobileNumber);

    // Upload the file buffer directly to S3 (no base64 decoding required)
    const uploadResult = await s3Service.uploadFileToS3(
      profileImage.buffer,
      profileImage.originalname,
      "profile-images",
      profileImage.mimetype || "application/octet-stream",
    );

    if (!uploadResult.success) {
      throw new Error("Failed to upload profile image");
    }
    let ProfileImageKey = uploadResult.key;

    // create user with default offline status
    const newUser = await User.create({
      name,
      mobileNumber,
      age,
      language,
      profileImage: ProfileImageKey,
      profile: JSON.stringify(profile),
      role: roles[roleid],
      rating: rating || 0,
      isVerified: true,
      isActive: true,
      isOnline: false,
      manualOffline: true,
      isBusy: false,
    });

    // Ensure wallets for the new practitioner user
    try {
      const walletService = require("./wallet.service");
      await walletService.ensureUserWallets(newUser.id, roles[roleid]);
    } catch (walletError) {
      console.error(
        `Failed to ensure wallets for new user ${newUser.id}:`,
        walletError,
      );
    }

    return newUser;
  }

  /**
   * Admin updates an existing listener/astrologer profile.
   * All fields are optional – only provided fields are applied.
   */
  async adminUpdateUser(userId, { name, mobileNumber, age, language, profile, profileImage, rating }) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (mobileNumber !== undefined && mobileNumber !== user.mobileNumber) {
      await this.assertMobileNumberAvailable(mobileNumber, user.id);
    }

    if (name !== undefined) user.name = name;
    if (mobileNumber !== undefined) user.mobileNumber = mobileNumber;
    if (age !== undefined) user.age = age;
    if (language !== undefined) user.language = language;
    if (profile !== undefined) user.profile = { ...user.profile, ...profile };
    if (rating !== undefined) user.rating = rating;

    if (profileImage) {
      // Upload new image to S3
      const uploadResult = await s3Service.uploadFileToS3(
        profileImage.buffer,
        profileImage.originalname,
        "profile-images",
        profileImage.mimetype || "application/octet-stream",
      );

      if (!uploadResult.success) {
        throw new Error("Failed to upload profile image");
      }

      // Delete old image from S3 if one existed
      if (user.profileImage) {
        try {
          await s3Service.deleteFileFromS3(user.profileImage);
        } catch (err) {
          console.error(`Failed to delete old profile image ${user.profileImage}:`, err);
        }
      }

      user.profileImage = uploadResult.key;
    }

    await user.save();

    // Return a fresh signed URL for the profile image
    const plain = user.toJSON();
    if (plain.profileImage) {
      try {
        plain.profileImage = await s3Service.getDownloadUrl(plain.profileImage);
      } catch (err) {
        console.error(`Error generating signed URL for ${plain.profileImage}:`, err);
        plain.profileImage = null;
      }
    }
    return plain;
  }

  async deleteAccount(userId) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }
    user.isActive = false;
    await user.save();
    await user.destroy();
    return user;
  }

  async deleteUser(userId, deletionType = "soft") {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (!["soft", "permanent"].includes(deletionType)) {
      throw new Error("deletionType must be either soft or permanent");
    }

    const [transactionCount, walletTransactionCount] = await Promise.all([
      Transaction.count({ where: { userId } }),
      WalletTransaction.count({
        include: [{ model: Wallet, as: "wallet", where: { userId } }],
      }),
    ]);

    const hasTransactionHistory = transactionCount > 0 || walletTransactionCount > 0;

    if (deletionType === "permanent") {
      if (hasTransactionHistory) {
        throw new Error("User has transaction history and cannot be permanently deleted");
      }

      await Wallet.destroy({ where: { userId } });
      await user.destroy({ force: true });
      return { deleted: true, softDeleted: false };
    }

    user.isActive = false;
    await user.save();
    await user.destroy();
    return { deleted: false, softDeleted: true };
  }

  async getAvailability(userId) {
    const user = await User.findByPk(userId, {
      attributes: ["id", "role", "isVideoCallAvailable"],
    });
    if (!user) {
      throw new Error("User not found");
    }
    const status = await redisService.getUserStatus(user.id, user.role);
    return {
      id: user.id,
      isOnline: status.isOnline,
      isVideoCallAvailable: user.isVideoCallAvailable,
    };
  }

  async updateAvailability(userId, isOnline, isVideoCallAvailable) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (isOnline !== undefined) {
      if (user.role === "listener" || user.role === "astrologer") {
        user.isOnline = isOnline;
        user.manualOffline = !isOnline;
        if (isOnline === false) {
          await redisService.setUserOffline(userId, "true", user.role);
        } else {
          await redisService.setManualUserOnline(userId, null, user.role);
        }
      }
    }

    if (isVideoCallAvailable !== undefined) {
      user.isVideoCallAvailable = isVideoCallAvailable;
    }

    await user.save();

    // Broadcast the manual availability change to all connected clients so that
    // user-facing Listener/Astrologer lists update in real-time without a refresh.
    // Scoped to listener/astrologer only — normal users manage presence via socket
    // connectivity, not this flag.
    // Uses the lazy-require pattern (same as updateBusyStatus below) to avoid a
    // circular dependency at module-load time.
    if (
      (user.role === "listener" || user.role === "astrologer") &&
      isOnline !== undefined
    ) {
      try {
        const { getIO } = require("../config/websocket");
        const io = getIO();
        if (io) {
          io.emit("user-status-changed", {
            userId: user.id,
            role: user.role,
            isOnline: user.isOnline,   // value already saved to DB — boolean
            isBusy: !!user.isBusy,
            lastSeen: new Date(),
            source: "manual-status",
          });
        }
      } catch (err) {
        // Socket may not be initialised in tests or during startup — never fatal.
        console.error("[updateAvailability] Error emitting socket event:", err);
      }
    }

    return user;
  }

  /**
   * Toggle a listener's manual "do not disturb".
   *
   * The manual flag lives in its own column (is_manual_busy) so a session starting, ending or a
   * stale-flag heal can never overwrite or clear it, and toggling it never touches the session
   * flags. `is_busy` stays the union of "manual" and "in a live session" for existing readers.
   */
  async updateBusyStatus(userId, isBusy) {
    if (typeof isBusy === "string" && (isBusy === "true" || isBusy === "false")) {
      isBusy = isBusy === "true"; // "false" is truthy; never let it switch busy on
    }
    if (typeof isBusy !== "boolean") {
      const err = new Error("isBusy must be a boolean");
      err.statusCode = 400;
      throw err;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const sessionBusy = await redisService.getUserBusyStatus(userId);
    const startedChats = await Chat.count({
      where: {
        [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }],
        status: "started",
      },
    });
    const inSession = !!sessionBusy || startedChats > 0;

    user.isManualBusy = isBusy;
    user.isBusy = isBusy || inSession;
    await user.save();

    try {
      const { getIO } = require("../config/websocket");
      const io = getIO();
      if (io) {
        io.emit("listener:status-changed", {
          listenerId: userId,
          isOnline: !user.manualOffline,
          isBusy: user.isBusy,
          busyType: isBusy ? "manual" : (inSession ? (sessionBusy?.type || "session") : undefined),
        });
      }
    } catch (err) {
      console.error("[updateBusyStatus] Error emitting socket event:", err);
    }

    return user;
  }

  async getFavorites(userId) {
    const favorites = await UserFavorite.findAll({
      where: { userId },
      include: [
        {
          model: User,
          as: "favoriteUser",
          required: true,
          attributes: [
            "id",
            "name",
            "profileImage",
            "role",
            "manualOffline",
            "lastSeen",
            "isVideoCallAvailable",
            "rating",
          ],
        },
      ],
    });

    const enhancedFavorites = await Promise.all(
      favorites.map(async (fav) => {
        if (!fav.favoriteUser) return null;
        
        const user = fav.favoriteUser.toJSON();
        const presence = await redisService.getUserStatus(
          user.id,
          user.role,
          user,
        );
        user.isOnline = presence.isOnline;
        user.lastSeen = presence.lastSeen || user.lastSeen;
        if (user.profileImage) {
          try {
            user.profileImage = await s3Service.getDownloadUrl(
              user.profileImage,
            );
          } catch (err) {
            console.error(
              `Error generating signed URL for ${user.profileImage}:`,
              err,
            );
            user.profileImage = null;
          }
        }
        user.rating = fav.favoriteUser.rating;

        // Fetch custom nickname if exists
        const chat = await Chat.findOne({
          where: {
            [Op.or]: [
              { participant1Id: userId, participant2Id: user.id },
              { participant1Id: user.id, participant2Id: userId },
            ],
          },
        });

        if (chat) {
          const chatSetting = await ChatSetting.findOne({
            where: { chatId: chat.id, userId },
          });
          if (chatSetting && chatSetting.customNickname) {
            user.name = chatSetting.customNickname;
          }
        }

        // Fallback if name is still null
        if (!user.name) {
          user.name = "Anonymous User";
        }

        return user;
      }),
    );

    return enhancedFavorites.filter(Boolean);
  }

  async toggleFavorite(userId, favoriteUserId) {
    if (userId === favoriteUserId) {
      throw new Error("You cannot favorite yourself");
    }

    const favoriteUser = await User.findByPk(favoriteUserId);
    if (!favoriteUser) {
      throw new Error("User to favorite not found");
    }

    const existingFavorite = await UserFavorite.findOne({
      where: { userId, favoriteUserId },
    });

    if (existingFavorite) {
      await existingFavorite.destroy();
      return { isFavorite: false };
    } else {
      await UserFavorite.create({ userId, favoriteUserId });
      return { isFavorite: true };
    }
  }

  async getPublicProfile(userId, requesterId = null) {
    const user = await User.findByPk(userId, {
      attributes: {
        exclude: [
          "password",
          "googleId",
          "otp",
          "otpExpiry",
          "email",
          "mobileNumber",
        ],
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const profile = user.toJSON();

    if (profile.profileImage) {
      try {
        profile.profileImage = await s3Service.getDownloadUrl(
          profile.profileImage,
        );
      } catch (err) {
        console.error(
          `Error generating signed URL for ${profile.profileImage}:`,
          err,
        );
        profile.profileImage = null;
      }
    }

    if (profile.role === "listener" || profile.role === "astrologer") {
      const currentPricing = await pricingService.getMyCurrentPricing(
        userId,
        profile.role,
      );

      profile.pricing = {
        chat: currentPricing.chat.pricePerMinute,
        audioCall: currentPricing.audio_call.pricePerMinute,
        videoCall: currentPricing.video_call.pricePerMinute,
      };
    }

    if (requesterId) {
      const isFavorite = await UserFavorite.findOne({
        where: { userId: requesterId, favoriteUserId: userId },
      });
      profile.isFavorite = !!isFavorite;

      const isBlocked = await UserBlockList.findOne({
        where: { userId: requesterId, blockedUserId: userId },
      });
      profile.isBlocked = !!isBlocked;

      const isBlockedByReceiver = await UserBlockList.findOne({
        where: { userId: userId, blockedUserId: requesterId },
      });
      profile.isBlockedByReceiver = !!isBlockedByReceiver;

      // Fetch custom nickname if exists
      const chat = await Chat.findOne({
        where: {
          [Op.or]: [
            { participant1Id: requesterId, participant2Id: userId },
            { participant1Id: userId, participant2Id: requesterId },
          ],
        },
      });

      if (chat) {
        const chatSetting = await ChatSetting.findOne({
          where: { chatId: chat.id, userId: requesterId },
        });
        if (chatSetting && chatSetting.customNickname) {
          profile.name = chatSetting.customNickname;
        }
      }
    }

    if (!profile.name) {
      profile.name = "Anonymous User";
    }

    return profile;
  }

  /**
   * Persist push-notification tokens for a user.
   * Called when the mobile app registers or refreshes its device tokens.
   *
   * @param {string} userId
   * @param {{ fcmToken?: string, voipToken?: string, platform: string }} fields
   */
  async updatePushToken(userId, fields) {
    await User.update(fields, { where: { id: userId } });
  }
}

module.exports = new UserService();
