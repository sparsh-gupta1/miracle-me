require("dotenv").config();
const { initializeFirebase } = require("../src/config/firebase-admin");
const { sendPushNotification } = require("../src/utils/push-notification");

// Mock process.env if needed, but we expect .env to be present
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON is missing in environment");
    process.exit(1);
}

try {
    console.log("Initializing Firebase...");
    initializeFirebase();
    console.log("✅ Firebase initialized successfully");

    // Mock sending a notification
    // We can't easily test actual sending without a valid token, but we can verify the function doesn't crash on init
    // and handles the send call (even if it fails due to invalid token)

    console.log("Attempting to send test notification...");
    const testToken = "test-token";
    sendPushNotification(testToken, "Test Title", "Test Body")
        .then(() => console.log("✅ sendPushNotification called without crash"))
        .catch(err => console.error("❌ sendPushNotification failed:", err));

} catch (error) {
    console.error("❌ Test failed:", error);
}
