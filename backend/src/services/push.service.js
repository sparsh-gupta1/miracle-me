/**
 * push.service.js
 *
 * Centralised push-notification gateway for incoming / cancelled calls.
 *
 * Platform routing:
 *   Android  → Firebase Cloud Messaging (FCM) — data-only, high-priority
 *   iOS      → Apple PushKit VoIP (APNs)      — wakes killed app via CallKit
 *
 * The service is intentionally non-throwing: if a push fails we log the error
 * and continue so that the Socket.IO path is never blocked.
 */

const { admin, initializeFirebase } = require("../config/firebase-admin");
const logger = require("../utils/logger");
const notificationConstants = require("../constants/notification.constants");

// ---------------------------------------------------------------------------
// APNs (iOS VoIP) — loaded lazily so the server starts even without creds
// ---------------------------------------------------------------------------
let apnProvider = null;

function getApnProvider() {
  if (apnProvider) return apnProvider;

  const keyPath = process.env.APNS_KEY_PATH;       // path to .p8 file  OR
  const keyContent = process.env.APNS_KEY_CONTENT; // raw .p8 content (for env-only deploys)
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;

  if ((!keyPath && !keyContent) || !keyId || !teamId || !bundleId) {
    logger.warn("[PushService] APNs credentials not fully configured — iOS VoIP push disabled.");
    return null;
  }

  try {
    // eslint-disable-next-line global-require
    const apn = require("apn");
    const opts = {
      token: {
        key: keyContent || keyPath, // apn accepts raw PEM string or file path
        keyId,
        teamId,
      },
      production: process.env.NODE_ENV === "production",
    };
    apnProvider = new apn.Provider(opts);
    logger.info("[PushService] APNs VoIP provider initialised.");
    return apnProvider;
  } catch (err) {
    logger.error("[PushService] Failed to init APNs provider:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// FCM helpers (Android + non-VoIP iOS)
// ---------------------------------------------------------------------------

/**
 * Send a data-only FCM message.
 * No `notification` key → Android wakes the app's headless JS task.
 */
async function sendFCM(fcmToken, data) {
  try {
    initializeFirebase();
    const message = {
      token: fcmToken,
      android: {
        priority: "high",
        ttl: 0, // deliver immediately, no buffering
      },
      // Pure data message — no notification key — so Android fires the
      // background service instead of showing a system notification.
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    };
    const response = await admin.messaging().send(message);
    logger.info(`[PushService] FCM sent. messageId=${response}`);
    return { success: true, messageId: response };
  } catch (err) {
    logger.error("[PushService] FCM send failed:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a visible FCM notification message (with `notification` key).
 * The Android OS renders this in the system tray without any client code.
 * Unlike sendFCM(), this is NOT a data-only message.
 *
 * @param {string} fcmToken
 * @param {string} title
 * @param {string} body
 * @param {object} [data]  - Optional extra data fields
 */
async function sendFCMNotification(fcmToken, title, body, data = {}) {
  try {
    initializeFirebase();
    const message = {
      token: fcmToken,
      notification: { title, body },
      android: {
        priority: "high",
        ttl: 86400 * 1000, // 24 h — give the OS time to deliver even if device is offline
        notification: {
          sound: "default",
          channelId: "default",
        },
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    };
    const response = await admin.messaging().send(message);
    logger.info(`[PushService] FCM notification sent. messageId=${response}`);
    return { success: true, messageId: response };
  } catch (err) {
    logger.error("[PushService] FCM notification send failed:", err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// APNs VoIP helpers (iOS)
// ---------------------------------------------------------------------------

/**
 * Send a PushKit VoIP APNs notification.
 * iOS requires apns-push-type: voip and a topic of <bundle>.voip.
 * The payload MUST cause the app to display a CallKit call immediately.
 */
async function sendAPNsVoip(voipToken, payload) {
  const provider = getApnProvider();
  if (!provider) return { success: false, error: "APNs provider not configured" };

  try {
    // eslint-disable-next-line global-require
    const apn = require("apn");
    const notification = new apn.Notification();
    notification.pushType = "voip";
    notification.topic = `${process.env.APNS_BUNDLE_ID}.voip`;
    notification.expiry = Math.floor(Date.now() / 1000) + 45; // 45 s TTL
    notification.payload = payload; // full custom payload

    const result = await provider.send(notification, voipToken);
    if (result.failed.length > 0) {
      const reason = result.failed[0]?.response?.reason || "unknown";
      logger.error(`[PushService] APNs send failed: ${reason}`);
      return { success: false, error: reason };
    }
    logger.info("[PushService] APNs VoIP push sent successfully.");
    return { success: true };
  } catch (err) {
    logger.error("[PushService] APNs send threw:", err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

// Provider errors that mean the stored token will never work again.
const DEAD_TOKEN_ERRORS = [
  "registration-token-not-registered",
  "invalid-registration-token",
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
];

/**
 * Normalise a sendFCM/sendAPNsVoip result into { channel, success, reason }
 * and clear the stored token when the provider says it is permanently dead.
 */
async function withChannel(channel, token, tokenField, receiver, sendResult) {
  if (sendResult?.success) return { channel, success: true };

  const reason = sendResult?.error || "unknown";
  if (receiver?.id && DEAD_TOKEN_ERRORS.some((e) => reason.includes(e))) {
    try {
      // eslint-disable-next-line global-require
      const { User } = require("../models");
      await User.update({ [tokenField]: null }, { where: { id: receiver.id, [tokenField]: token } });
      logger.warn(`[PushService] Cleared dead ${tokenField} for user ${receiver.id}: ${reason}`);
    } catch (err) {
      logger.error(`[PushService] Failed to clear dead ${tokenField} for user ${receiver.id}: ${err.message}`);
    }
  }
  return { channel, success: false, reason };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send an "incoming call" push to wake up a background/killed receiver app.
 *
 * @param {object} receiver   - User record (must include platform, fcmToken, voipToken, name)
 * @param {object} callPayload - Call metadata to embed in the push
 * @param {string} callPayload.requestId
 * @param {string} callPayload.channelName     - Agora channel / conversationId
 * @param {string} callPayload.callerName
 * @param {string} callPayload.callType        - "video_call" | "audio_call"
 * @param {string} callPayload.agoraAppId
 * @param {string} callPayload.acceptedToken   - Agora RTC token for the receiver
 * @param {string} callPayload.agoraUid        - Receiver's Agora UID
 * @param {string} callPayload.conversationId
 * @param {string} callPayload.requestType
 * @param {string} callPayload.senderId
 * @param {string} callPayload.chatId
 */
exports.sendIncomingCallNotification = async (receiver, callPayload) => {
  const { platform, fcmToken, voipToken } = receiver;
  const isChatRequest = callPayload.requestType === "chat";
  const data = {
    type: isChatRequest ? "incoming_chat" : "incoming_call",
    request_type: callPayload.requestType || callPayload.callType,
    title: notificationConstants.PUSH.INCOMING_REQUEST.TITLE(callPayload.requestType || callPayload.callType),
    body: notificationConstants.PUSH.INCOMING_REQUEST.BODY(callPayload.callerName, callPayload.requestType || callPayload.callType),
    requestId: callPayload.requestId,
    request_id: callPayload.requestId,
    senderId: callPayload.senderId || "",
    callerId: callPayload.senderId || "",
    channelName: callPayload.channelName,
    callerName: callPayload.callerName,
    sender_name: callPayload.callerName,
    callType: callPayload.callType,
    agoraAppId: callPayload.agoraAppId || "",
    acceptedToken: callPayload.acceptedToken || "",
    agoraUid: String(callPayload.agoraUid || ""),
    conversationId: callPayload.conversationId,
    chatId: callPayload.chatId || callPayload.conversationId,
  };

  let result;
  if (platform === "android") {
    if (!fcmToken) {
      logger.warn(`[PushService] Android receiver ${receiver.id} has no fcmToken — skip push.`);
      return { channel: "none", success: false, reason: "no_fcm_token" };
    }
    result = await withChannel("fcm", fcmToken, "fcmToken", receiver, await sendFCM(fcmToken, data));
  } else if (platform === "ios") {
    // iOS: try VoIP (PushKit) first; fall back to FCM if no voipToken
    if (voipToken) {
      const iosPayload = {
        aps: {
          alert: {
            title: notificationConstants.PUSH.INCOMING_REQUEST.TITLE(callPayload.requestType),
            body: notificationConstants.PUSH.INCOMING_REQUEST.BODY(callPayload.callerName, callPayload.requestType),
          },
          sound: "default",
          "content-available": 1,
        },
        ...data,
      };
      result = await withChannel("apns", voipToken, "voipToken", receiver, await sendAPNsVoip(voipToken, iosPayload));
    } else if (fcmToken) {
      // Fallback: send via FCM (works for foreground / background but not killed-state reliably)
      logger.warn(`[PushService] iOS receiver ${receiver.id} has no voipToken — falling back to FCM.`);
      result = await withChannel("fcm", fcmToken, "fcmToken", receiver, await sendFCM(fcmToken, data));
    } else {
      logger.warn(`[PushService] iOS receiver ${receiver.id} has neither voipToken nor fcmToken — skip push.`);
      return { channel: "none", success: false, reason: "no_push_token" };
    }
  } else {
    // Unknown platform — try FCM if available
    if (fcmToken) {
      result = await withChannel("fcm", fcmToken, "fcmToken", receiver, await sendFCM(fcmToken, data));
    } else {
      logger.warn(`[PushService] Receiver ${receiver.id} has unknown platform "${platform}" and no fcmToken — skip push.`);
      return { channel: "none", success: false, reason: "no_fcm_token" };
    }
  }
  return result;
};

/**
 * Send a "cancel call" push so the receiver's ringtone/UI is dismissed even
 * if the receiver's app is in the background/killed state.
 *
 * @param {object} receiver  - User record
 * @param {string} requestId - The call request ID to cancel
 */
exports.sendCancelCallNotification = async (receiver, requestId) => {
  const { platform, fcmToken, voipToken } = receiver;
  const data = { type: "cancel_call", requestId, request_id: String(requestId) };

  if (platform === "android") {
    if (fcmToken) await sendFCM(fcmToken, data);
  } else if (platform === "ios") {
    if (voipToken) {
      await sendAPNsVoip(voipToken, { aps: { "content-available": 1 }, ...data });
    } else if (fcmToken) {
      await sendFCM(fcmToken, data);
    }
  } else if (fcmToken) {
    await sendFCM(fcmToken, data);
  }
};

/**
 * Send a "missed call" visible notification so the receiver's OS notification
 * tray shows a "Missed Call" banner without any custom client code.
 *
 * Two-platform strategy:
 *  - Android : FCM message WITH a `notification` key → OS renders it natively.
 *  - iOS     : Regular APNs alert (NOT VoIP/PushKit) → iOS shows a banner.
 *
 * This is intentionally separate from sendCancelCallNotification so the cancel
 * push (which dismisses the ringing UI) and the missed call banner can be sent
 * in sequence.
 *
 * @param {object} receiver    - User record (platform, fcmToken, voipToken)
 * @param {string} requestId   - Call request ID
 * @param {string} callerName  - Display name of the caller
 */
exports.sendMissedCallNotification = async (receiver, requestId, callerName, serviceType) => {
  const { platform, fcmToken, voipToken } = receiver;
  
  const title = notificationConstants.PUSH.MISSED_REQUEST.TITLE(serviceType);
  const body = notificationConstants.PUSH.MISSED_REQUEST.BODY(callerName, serviceType);
  const extraData = { type: "missed_call", requestId: String(requestId) };

  if (platform === "android") {
    if (!fcmToken) {
      logger.warn(`[PushService] Missed call: Android receiver ${receiver.id} has no fcmToken — skip.`);
      return;
    }
    await sendFCMNotification(fcmToken, title, body, extraData);
  } else if (platform === "ios") {
    // iOS: use a regular APNs alert (NOT VoIP/PushKit topic) so the OS shows
    // a standard notification banner. No client code needed.
    const provider = getApnProvider();
    if (provider) {
      try {
        // eslint-disable-next-line global-require
        const apn = require("apn");
        const notification = new apn.Notification();
        // Regular alert topic — no ".voip" suffix
        notification.topic = process.env.APNS_BUNDLE_ID;
        notification.pushType = "alert";
        notification.expiry = Math.floor(Date.now() / 1000) + 86400; // 24 h
        notification.alert = { title, body };
        notification.sound = "default";
        notification.payload = extraData;

        // Prefer voipToken if available; fall back to a regular token field if provided.
        const deviceToken = voipToken || fcmToken; // fcmToken here is just a fallback key name
        if (!deviceToken) {
          logger.warn(`[PushService] Missed call: iOS receiver ${receiver.id} has no token — skip.`);
          return;
        }
        const result = await provider.send(notification, deviceToken);
        if (result.failed.length > 0) {
          const reason = result.failed[0]?.response?.reason || "unknown";
          logger.error(`[PushService] Missed call APNs alert failed: ${reason}`);
        } else {
          logger.info("[PushService] Missed call APNs alert sent.");
        }
      } catch (err) {
        logger.error("[PushService] Missed call APNs alert threw:", err.message);
      }
    } else if (fcmToken) {
      // APNs not configured — fall back to FCM notification
      logger.warn(`[PushService] Missed call: APNs not configured for iOS receiver ${receiver.id} — falling back to FCM.`);
      await sendFCMNotification(fcmToken, title, body, extraData);
    } else {
      logger.warn(`[PushService] Missed call: iOS receiver ${receiver.id} has no available push token — skip.`);
    }
  } else {
    // Unknown platform — best effort FCM
    if (fcmToken) {
      await sendFCMNotification(fcmToken, title, body, extraData);
    } else {
      logger.warn(`[PushService] Missed call: receiver ${receiver.id} has unknown platform and no fcmToken — skip.`);
    }
  }
};

/**
 * Send a standard push notification to prompt a user to recharge
 * when a listener tries to call them.
 *
 * @param {object} receiver    - User record (platform, fcmToken, voipToken)
 * @param {string} callerName  - Display name of the caller
 */
exports.sendRechargeNotification = async (receiver, callerName, serviceType) => {
  const { platform, fcmToken } = receiver;
  const title = notificationConstants.PUSH.RECHARGE_REQUIRED.TITLE;
  const body = notificationConstants.PUSH.RECHARGE_REQUIRED.BODY(callerName, serviceType);
  const extraData = { type: "recharge_prompt" };

  if (platform === "android") {
    if (fcmToken) {
      await sendFCMNotification(fcmToken, title, body, extraData);
    }
  } else if (platform === "ios") {
    // For iOS, we use a standard FCM notification (or regular APNs alert) since it's not a live VoIP call
    if (fcmToken) {
      await sendFCMNotification(fcmToken, title, body, extraData);
    }
  } else if (fcmToken) {
    await sendFCMNotification(fcmToken, title, body, extraData);
  }
};
