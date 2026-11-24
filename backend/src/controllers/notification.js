const { sendPushNotification } = require("../utils/push-notification");
const { User, Chat } = require("../models");
const conversationService = require("../services/conversation.service");
const redisService = require("../services/redis.service");
const notificationConstants = require("../constants/notification.constants");

exports.sendMessage = async (req, res, next) => {
  const { fcmToken, title, body, data } = req.body;
  try {
    await sendPushNotification(fcmToken, title, body, data);
    return res.send({ success: true });
  } catch (error) {
    next(error);
  }
};

exports.sendToUser = async (req, res, next) => {
  try {
    const senderId = req.user.id;
    const { receiver_id } = req.params;

    const [sender, receiver] = await Promise.all([
      User.findByPk(senderId),
      User.findByPk(receiver_id)
    ]);

    if (!receiver) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Create/get chat conversation so it appears in inbox
    const chat = await conversationService.createConversation(senderId, receiver_id);

    // Bump the chat to the top of the inbox
    await Chat.update({ lastMessageAt: new Date() }, { where: { id: chat.id } });

    // Set notification flag for the receiver
    await redisService.setPendingNotification(receiver_id, chat.id);

    const title = notificationConstants.PUSH.NEW_MESSAGE.TITLE;
    const body = notificationConstants.PUSH.NEW_MESSAGE.BODY(sender?.name);

    if (receiver.fcmToken) {
      // Send push notification without throwing if token is missing,
      // since the inbox flag is now stored and they will see it later.
      sendPushNotification(receiver.fcmToken, title, body, {}).catch(e => console.error("Push failed", e));
    }

    return res.send({ success: true, message: "Notification sent successfully" });
  } catch (error) {
    next(error);
  }
};
