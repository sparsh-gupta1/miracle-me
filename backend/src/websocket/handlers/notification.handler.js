const { sendPushNotification } = require("../../utils/push-notification");
const { User } = require("../../models");
const notificationConstants = require("../../constants/notification.constants");
const WS_MESSAGES = require("../../constants/websocket-messages.constants");

module.exports = (io, socket) => {
  const userId = socket.user.id;

  socket.on("notify-user", async (data) => {
    try {
      const { receiverId, message } = data;

      if (userId === receiverId) return;

      const receiverDetails = await User.findByPk(receiverId);
      if (!receiverDetails) {
        return socket.emit("notify-error", { message: WS_MESSAGES.NOTIFICATION.ERRORS.RECEIVER_NOT_FOUND });
      }

      const senderDetails = await User.findByPk(userId);
      const senderName = senderDetails?.name || socket.user_data?.name || "A user";

      const defaultmessage = notificationConstants.PUSH.NEW_MESSAGE.BODY(senderName);

      let finalMessage = message;
      // Replace "null" or "undefined" messages with a proper one
      if (!finalMessage || String(finalMessage).includes("null") || String(finalMessage).includes("undefined")) {
        finalMessage = defaultmessage;
      }

      await sendPushNotification(
        receiverDetails.fcmToken,
        notificationConstants.PUSH.NEW_MESSAGE.TITLE,
        finalMessage
      );
    } catch (error) {
      console.error("Error in notify-user:", error);
    }
  });
};
