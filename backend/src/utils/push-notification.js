const { admin } = require("../config/firebase-admin.js");

exports.sendPushNotification = async (fcmToken, title, body, data = {}) => {
  const message = {
    token: fcmToken, // Device token
    notification: {
      title,
      body,
    },
    data: {
      ...data, // Optional: send custom data
    },
  };

  try {
    if (!admin.apps.length) {
      console.error("Firebase admin not initialized");
      return;
    }
    const response = await admin.messaging().send(message);
    console.log("Successfully sent message:", response);
  } catch (error) {
    console.error("Error sending message:", error);
  }
};
