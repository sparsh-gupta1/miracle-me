// services/redis.service.js
const Redis = require("redis");
const { User } = require("../models");
const logger = require("../utils/logger");

class RedisService {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
  }

  async connect(existingClient = null) {
    try {
      if (existingClient) {
        this.client = existingClient;
        if (!this.client.isOpen) {
          await this.client.connect();
        }
      } else {
        this.client = Redis.createClient({
          url: `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`,
          password: process.env.REDIS_PASSWORD || "",
        });
        await this.client.connect();
      }

      // v4/v5 requires separate clients for pub/sub
      this.subscriber = this.client.duplicate();
      this.publisher = this.client.duplicate();

      await Promise.all([this.subscriber.connect(), this.publisher.connect()]);

      logger.info("Redis service (Client, Pub, Sub) connected successfully");
    } catch (error) {
      logger.error("Redis connection error:", error);
      throw error;
    }
  }

  // User online status management
  async setUserOnline(userId, socketId, role = null) {
    const key = `user:${userId}:status`;

    if (this.isPresenceOverrideRole(role)) return;

    const socketsKey = `user:${userId}:sockets`;
    await this.client.sAdd(socketsKey, socketId);
    await this.client.expire(socketsKey, 300);

    await this.client.hSet(key, {
      isOnline: "true",
      socketId: socketId,
      lastSeen: new Date().toISOString(),
      manualOffine: "false",
    });
    await this.client.expire(key, 300); // Expire in 5 minutes if not refreshed
  }

  async refreshUserSocket(userId, socketId, role = null) {
    if (this.isPresenceOverrideRole(role)) return;
    const socketsKey = `user:${userId}:sockets`;
    const key = `user:${userId}:status`;
    await this.client.sAdd(socketsKey, socketId);
    await this.client.expire(socketsKey, 300);
    await this.client.hSet(key, {
      isOnline: "true",
      socketId,
      lastSeen: new Date().toISOString(),
      manualOffine: "false",
    });
    await this.client.expire(key, 300);
  }

  async removeUserSocket(userId, socketId, role = null) {
    if (this.isPresenceOverrideRole(role)) return false;
    const socketsKey = `user:${userId}:sockets`;
    const key = `user:${userId}:status`;
    await this.client.sRem(socketsKey, socketId);
    const remaining = await this.client.sCard(socketsKey);
    if (remaining > 0) {
      await this.client.expire(socketsKey, 300);
      return true;
    }
    await this.client.del(socketsKey);
    await this.client.hSet(key, {
      isOnline: "false",
      lastSeen: new Date().toISOString(),
      manualOffine: "false",
    });
    await this.client.hDel(key, "socketId");
    await this.client.expire(key, 300);
    return false;
  }

  async setUserOffline(userId, manualOffine = "false", role = null) {
    const key = `user:${userId}:status`;

    if (role === "listener" || role === "astrologer") {
      try {
        const dbUser = await User.findByPk(userId);
        if (dbUser) {
          dbUser.isOnline = false;
          dbUser.manualOffline = manualOffine === "true";
          dbUser.lastSeen = new Date();
          await dbUser.save();
        }
      } catch (error) {
        logger.error(
          "Error syncing listener/astrologer DB offline state:",
          error,
        );
      }
    }

    await this.client.hSet(key, {
      isOnline: "false",
      lastSeen: new Date().toISOString(),
      manualOffine,
    });
    await this.client.hDel(key, "socketId");
    if (manualOffine === "true") {
      await this.client.persist(key);
    }
  }

  async setManualUserOnline(userId, socketId, role = null) {
    const key = `user:${userId}:status`;
    const data = {
      isOnline: "true",
      lastSeen: new Date().toISOString(),
      manualOffine: "false",
    };

    if (role === "listener" || role === "astrologer") {
      try {
        const dbUser = await User.findByPk(userId);
        if (dbUser) {
          dbUser.isOnline = true;
          dbUser.manualOffline = false;
          dbUser.lastSeen = new Date();
          await dbUser.save();
        }
      } catch (error) {
        logger.error(
          "Error syncing listener/astrologer DB manual online state:",
          error,
        );
      }
    }

    if (socketId) {
      data.socketId = socketId;
    }

    await this.client.hSet(key, data);
    await this.client.persist(key);
  }

  async getRawUserStatus(userId) {
    const key = `user:${userId}:status`;
    const status = await this.client.hGetAll(key);

    if (!status || Object.keys(status).length === 0) {
      return {
        isOnline: false,
        socketId: null,
        lastSeen: null,
        manualOffine: false,
      };
    }

    return {
      isOnline: status.isOnline === "true",
      socketId: status.socketId || null,
      lastSeen: status.lastSeen ? new Date(status.lastSeen) : null,
      manualOffine: status.manualOffine === "true",
    };
  }

  async getUserStatus(userId, role, userSnapshot = null) {
    const key = `user:${userId}:status`;

    const status = await this.client.hGetAll(key);

    if (role === "listener" || role === "astrologer") {
      const dbUser =
        userSnapshot ||
        (await User.findByPk(userId, {
          attributes: ["manualOffline", "lastSeen"],
        }));
      const manualOffline = dbUser?.manualOffline === true;
      return {
        isOnline: !manualOffline,
        socketId: status.socketId || null,
        lastSeen:
          dbUser?.lastSeen ||
          (status.lastSeen ? new Date(status.lastSeen) : null),
        manualOffine: manualOffline,
      };
    }

    const socketCount = await this.client.sCard(`user:${userId}:sockets`);

    return {
      isOnline: socketCount > 0,
      socketId: status.socketId || null,
      lastSeen: status.lastSeen ? new Date(status.lastSeen) : null,
      manualOffine: false,
    };
  }

  isPresenceOverrideRole(role) {
    return role === "listener" || role === "astrologer";
  }

  async isUserReachable(userId, role) {
    if (!this.isPresenceOverrideRole(role)) {
      const status = await this.getUserStatus(userId, role);
      return status.isOnline;
    }

    const status = await this.getUserStatus(userId, role);
    return status.isOnline && !status.manualOffine;
  }

  // Active chat management (key feature for seen messages)
  async setUserActiveInChat(userId, chatId) {
    const key = `chat:${chatId}:active_users`;
    await this.client.sAdd(key, userId);
    await this.client.expire(key, 3600); // Expire in 1 hour

    // Also set individual user's active chat
    const userChatKey = `user:${userId}:active_chat`;
    await this.client.set(userChatKey, chatId);
    await this.client.expire(userChatKey, 3600);
  }

  async removeUserFromActiveChat(userId, chatId) {
    const key = `chat:${chatId}:active_users`;
    await this.client.sRem(key, userId);

    // Remove user's active chat
    const userChatKey = `user:${userId}:active_chat`;
    const activeChat = await this.client.get(userChatKey);
    if (activeChat === chatId) {
      await this.client.del(userChatKey);
    }
  }

  async getChatActiveUsers(chatId) {
    const key = `chat:${chatId}:active_users`;
    const activeUsers = await this.client.sMembers(key);
    return activeUsers;
  }

  async isUserActiveInChat(userId, chatId) {
    const key = `chat:${chatId}:active_users`;
    const isActive = await this.client.sIsMember(key, userId);
    return isActive;
  }

  async getUserActiveChat(userId) {
    const key = `user:${userId}:active_chat`;
    return await this.client.get(key);
  }

  // Message caching for better performance
  async cacheMessage(message) {
    const key = `message:${message.id}`;
    await this.client.hSet(key, {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      messageType: message.messageType,
      isDelivered: message.isDelivered.toString(),
      isRead: message.isRead.toString(),
      createdAt: message.createdAt.toISOString(),
    });
    await this.client.expire(key, 86400); // Expire in 24 hours
  }

  async getCachedMessage(messageId) {
    const key = `message:${messageId}`;
    const messageData = await this.client.hGetAll(key);

    if (Object.keys(messageData).length === 0) {
      return null;
    }

    return {
      id: messageData.id,
      chatId: messageData.chatId,
      senderId: messageData.senderId,
      receiverId: messageData.receiverId,
      content: messageData.content,
      messageType: messageData.messageType,
      isDelivered: messageData.isDelivered === "true",
      isRead: messageData.isRead === "true",
      createdAt: new Date(messageData.createdAt),
    };
  }

  // Chat room management
  async addUserToRoom(roomId, userId) {
    const key = `room:${roomId}:users`;
    await this.client.sAdd(key, userId);
  }

  async removeUserFromRoom(roomId, userId) {
    const key = `room:${roomId}:users`;
    await this.client.sRem(key, userId);
  }

  async getRoomUsers(roomId) {
    const key = `room:${roomId}:users`;
    return await this.client.sMembers(key);
  }

  // Typing indicators
  async setUserTyping(chatId, userId, isTyping = true) {
    const key = `chat:${chatId}:typing`;
    if (isTyping) {
      await this.client.sAdd(key, userId);
      await this.client.expire(key, 10); // Auto-remove after 10 seconds
    } else {
      await this.client.sRem(key, userId);
    }
  }

  async getTypingUsers(chatId) {
    const key = `chat:${chatId}:typing`;
    return await this.client.sMembers(key);
  }

  // Unread message counters
  async incrementUnreadCount(userId, chatId) {
    const key = `user:${userId}:unread:${chatId}`;
    await this.client.incr(key);
  }

  async getUnreadCount(userId, chatId) {
    const key = `user:${userId}:unread:${chatId}`;
    const count = await this.client.get(key);
    return parseInt(count) || 0;
  }

  async resetUnreadCount(userId, chatId) {
    const key = `user:${userId}:unread:${chatId}`;
    await this.client.del(key);
  }

  async getAllUnreadCounts(userId) {
    const pattern = `user:${userId}:unread:*`;
    let keys = [];

    try {
      keys = await this.client.keys(pattern);
    } catch (err) {
      console.error("Redis error in getAllUnreadCounts:", err);
      return {};
    }

    if (!Array.isArray(keys) || keys.length === 0) {
      return {}; // No unread keys found
    }

    const unreadCounts = {};

    for (const key of keys) {
      const chatId = key.split(":")[3];
      const count = await this.client.get(key);
      unreadCounts[chatId] = parseInt(count) || 0;
    }

    return unreadCounts;
  }

  // Pending Notifications for Inbox UI Flag
  async setPendingNotification(userId, chatId) {
    const key = `user:${userId}:pending_notifications`;
    await this.client.sAdd(key, chatId);
    await this.client.expire(key, 86400 * 7); // Expire in 7 days to avoid permanent leak
  }

  async getPendingNotifications(userId) {
    const key = `user:${userId}:pending_notifications`;
    return await this.client.sMembers(key);
  }

  async clearPendingNotification(userId, chatId) {
    const key = `user:${userId}:pending_notifications`;
    await this.client.sRem(key, chatId);
  }

  async clearAllPendingNotifications(userId) {
    const key = `user:${userId}:pending_notifications`;
    await this.client.del(key);
  }

  // Publish/Subscribe for real-time events
  async publish(channel, data) {
    await this.publisher.publish(channel, JSON.stringify(data));
  }

  async subscribe(channel, callback) {
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        logger.error("Error parsing Redis message:", error);
      }
    });
  }

  async setUserVideoCallStatus(userId, status) {
    const key = `user:${userId}:video_call_status`;
    console.log("key", key);

    await this.client.set(key, status);
  }

  async getUserVideoCallStatus(userId) {
    const key = `user:${userId}:video_call_status`;
    return await this.client.get(key);
  }

  async setChatSessionActivity(chatId, payerId = null) {
    const key = `chat:${chatId}:session_activity`;
    const data = { updatedAt: new Date().toISOString() };
    if (payerId) data.payerId = payerId;
    await this.client.hSet(key, data);
    await this.client.expire(key, 300); // 5 minutes idle timeout
  }

  async getChatSessionActivity(chatId) {
    const key = `chat:${chatId}:session_activity`;
    const exists = await this.client.exists(key);
    if (!exists) return null;
    return await this.client.hGetAll(key);
  }

  async getChatSessionPayerId(chatId) {
    const key = `chat:${chatId}:session_activity`;
    return await this.client.hGet(key, 'payerId');
  }

  async deleteChatSessionActivity(chatId) {
    const key = `chat:${chatId}:session_activity`;
    await this.client.del(key);
  }

  // User Busy Status
  /**
   * Attempt to acquire an atomic lock for a user session setup.
   * @param {string} userId
   * @param {string} sessionType - e.g., "chat" or "call"
   * @param {string} sessionId
   * @returns {Promise<string|null>} Lock token if acquired, null if already locked
   */
  async acquireUserSessionLock(userId, sessionType, sessionId) {
    const key = `user:${userId}:session_lock`;
    const token = `${userId}_${sessionId}_${Math.random().toString(36).substring(2, 15)}`;
    
    const acquired = await this.client.set(key, token, {
      NX: true,
      EX: 15 // 15 seconds temporary acquisition lock
    });
    
    if (acquired) {
      return token;
    }
    return null;
  }

  /**
   * Release the temporary acquisition lock.
   * @param {string} userId
   * @param {string} token - The token returned by acquireUserSessionLock
   */
  async releaseUserSessionLock(userId, token) {
    if (!token) return; // nothing was acquired
    const key = `user:${userId}:session_lock`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.client.eval(script, {
      keys: [key],
      arguments: [token]
    });
  }

  /**
   * Mark a user as busy in an active session.
   * @param {string} userId
   * @param {string} conversationId - The chat/call conversation ID occupying the user
   * @param {string} type - "chat" | "audio_call" | "video_call"
   */
  async setUserBusyStatus(userId, conversationId, type = "chat") {
    const key = `user:${userId}:busy`;
    await this.client.hSet(key, {
      conversationId: String(conversationId),
      type,
      since: new Date().toISOString(),
    });
    // TTL acts as a safety net — if the session end never clears the key, it auto-expires.
    await this.client.expire(key, 7200); // 2 hours max
  }

  /**
   * Extend the busy key's TTL for a session that is still running, so a call or chat
   * longer than the 2h safety net is not silently shown as free. No-op if the key is gone.
   * @param {string} userId
   */
  async refreshUserBusyTtl(userId) {
    await this.client.expire(`user:${userId}:busy`, 7200);
  }

  /**
   * Clear a user's busy state (call this when the session ends).
   * @param {string} userId
   */
  async clearUserBusyStatus(userId) {
    const key = `user:${userId}:busy`;
    await this.client.del(key);
  }

  /**
   * Get a user's current busy info, or null if they are free.
   * @param {string} userId
   * @returns {Promise<{conversationId: string, type: string, since: string}|null>}
   */
  async getUserBusyStatus(userId) {
    const key = `user:${userId}:busy`;
    const data = await this.client.hGetAll(key);
    if (!data || !data.conversationId) return null;
    return data;
  }

  // Generic Redis Methods
  async set(key, value, expirySeconds = null) {
    if (expirySeconds) {
      await this.client.set(key, value, {
        EX: expirySeconds,
      });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key) {
    return await this.client.get(key);
  }

  async del(key) {
    await this.client.del(key);
  }

  async disconnect() {
    if (this.client) await this.client.quit();
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
  }
}

module.exports = new RedisService();
