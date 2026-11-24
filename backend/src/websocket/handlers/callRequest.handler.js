const { User, CallRequest } = require("../../models");
const logger = require("../../utils/logger.js");
const { assertCanCommunicate } = require("../../utils/communicationRules");
const CallRequestService = require("../../services/chatRequest.service.js");
const chatService = require("../../services/chat.service.js");
const conversationService = require("../../services/conversation.service.js");
const redisService = require("../../services/redis.service.js");
const callDurationMonitor = require("../../services/callDurationMonitor.service.js");
const callLifecycle = require("../../services/callLifecycle.service.js");
const agoraService = require("../../services/agora.service.js");
const pushService = require("../../services/push.service.js");
const WS_MESSAGES = require("../../constants/websocket-messages.constants.js");
const { callerInSessionError, listenerBusyError, tryAgainError } = require("../../utils/busyErrors");
const { emitStatus } = require("../presence");

// Duration (ms) to wait for the receiver to accept before auto-cancelling
const CALL_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_SECONDS = CALL_TIMEOUT_MS / 1000;
// An accepted chat request holds both users busy until the first message; after this it expires.
const CHAT_FIRST_MESSAGE_TIMEOUT_MS = 60_000;

// Module-level map: request_id → intervalId
// Keeps the countdown ticker alive across multiple event handlers.
const callTickIntervals = new Map();

/**
 * Start a per-second countdown ticker that emits `call-ringing-tick` to both
 * the caller and receiver so the client can show a live countdown timer.
 *
 * The interval MUST be cleared via clearRingingTicker() in every terminal
 * flow (timeout, accept, reject, cancel) to avoid leaking timers.
 *
 * Emitted payload: { request_id, secondsLeft, totalSeconds }
 */
function startRingingTicker(io, request_id, callerId, receiverId) {
  let secondsLeft = CALL_TIMEOUT_SECONDS;
  const tick = () => {
    secondsLeft -= 1;
    const payload = { request_id, secondsLeft, totalSeconds: CALL_TIMEOUT_SECONDS };
    io.to(`user:${callerId}`).emit("call-ringing-tick", payload);
    io.to(`user:${receiverId}`).emit("call-ringing-tick", payload);
    // Never outlive the ring window, even if the call's Redis state was torn down elsewhere
    // (a missing hash makes the timeout a no-op, which used to leave this running forever).
    if (secondsLeft <= 0) clearRingingTicker(request_id);
  };
  const intervalId = setInterval(tick, 1000);
  callTickIntervals.set(request_id, intervalId);
}

function clearRingingTicker(request_id) {
  const intervalId = callTickIntervals.get(request_id);
  if (intervalId) {
    clearInterval(intervalId);
    callTickIntervals.delete(request_id);
  }
}

// NOTE: Billing start/stop is owned by callLifecycle.service.js so that the
// Agora NCS webhook (authoritative) and these socket events (frontend fast-path)
// share one idempotent code path. The socket events below are no longer the sole
// trigger for billing — they simply forward the same signals into the service.

module.exports = (io, socket) => {
  const userId = socket.user.id;

  // ---------------------------------------------------------------------------
  // EVENT: call-request — Caller initiates a call
  // ---------------------------------------------------------------------------
  socket.on("call-request", async (data) => {
    let { request_type, receiver_id } = data;
    const serviceType = conversationService.normalizeServiceType(request_type);
    const isMediaCall = serviceType === "audio_call" || serviceType === "video_call";

    if (!serviceType || !receiver_id) {
      return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.MISSING_PARAMS });
    }

    if (userId === receiver_id) {
      return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.CALL_SELF });
    }

    // Session locks taken by the busy guard; released in `finally` whatever happens.
    const heldLocks = [];
    // Hoisted so the outer catch can undo exactly what this request did.
    let chat, request_created;
    let busyMarked = false;

    try {
      const [receiver, caller] = await Promise.all([
        User.findByPk(receiver_id, {
          // Include push-token fields so we can wake the receiver's device
          attributes: ["id", "name", "role", "fcmToken", "voipToken", "platform"],
        }),
        User.findByPk(userId, { attributes: ["id", "name"] }),
      ]);

      if (!receiver) {
        return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.USER_NOT_FOUND });
      }

      // findByPk is lenient about id formatting; rooms and Redis keys are not.
      // Use the canonical id from here on so the emit lands in the right room.
      receiver_id = receiver.id;
      if (userId === receiver_id) {
        return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.CALL_SELF });
      }
      // Reject disallowed pairs (user↔user, listener↔astrologer) before any balance check,
      // busy lock or push. Billing cannot price them and would end the session unbilled.
      try {
        assertCanCommunicate(socket.user.role, receiver.role);
      } catch (ruleError) {
        return socket.emit("call-request:error", { message: ruleError.message });
      }
      const callerName = caller?.name || (socket.user.role !== "user" ? "The listener" : "User");

      // Determine payer and earner based on roles
      let payerId = userId;
      let earnerId = receiver_id;

      if (socket.user.role !== "user" && receiver.role === "user") {
        payerId = receiver_id;
        earnerId = userId;
      } else if (socket.user.role === "user" && receiver.role !== "user") {
        payerId = userId;
        earnerId = receiver_id;
      }

      const [receiverStatus, balanceValidation] = await Promise.all([
        redisService.getUserStatus(receiver_id, receiver.role),
        conversationService.validateBalanceAndCalculateDuration(payerId, earnerId, serviceType),
      ]);

      if (!receiverStatus?.isOnline) {
        return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.RECEIVER_OFFLINE });
      }
      if (!balanceValidation.hasSufficientBalance) {
        // --- NEW LOGIC: Notify the User if a Listener is trying to reach them ---
        if (socket.user.role !== "user" && receiver.role === "user") {
          const msg = `${callerName} wants to talk to you. Please recharge your wallet to connect.`;

          // 1. Emit live WebSocket event to User (if they are online/in-app)
          io.to(`user:${receiver_id}`).emit("wallet:recharge_prompt", {
            message: msg,
            callerId: userId,
            serviceType: serviceType,
            minimumRequired: balanceValidation.minimumBalanceRequired
          });

          // 2. Send Push Notification to User (if they are in background/killed)
          const pushService = require("../../services/push.service.js");
          pushService.sendRechargeNotification(receiver, callerName, serviceType)
            .catch(err => logger.error(`[Push] Failed to send recharge notification: ${err.message}`));
        }
        // ------------------------------------------------------------------------

        return socket.emit("call-request:error", {
          message: `Insufficient balance. Need ₹${balanceValidation.minimumBalanceRequired.toFixed(2)}`,
          error_code: "INSUFFICIENT_BALANCE",
          balance_info: balanceValidation
        });
      }

      // 0. Prevent call if they already have an active session together
      const { Chat } = require("../../models");
      const { Op } = require("sequelize");
      const existingChat = await Chat.findOne({
        where: {
          [Op.or]: [
            { participant1Id: userId, participant2Id: receiver_id },
            { participant1Id: receiver_id, participant2Id: userId },
          ],
          status: "started"
        }
      });
      if (existingChat) {
        return socket.emit("call-request:error", { message: "An active session already exists between these users." });
      }

      // ── Atomic Busy Guard ────────────────────────────────────────────────────
      const verifyUserNotBusy = async (uId, { isReceiver = false } = {}) => {
        const lockToken = await redisService.acquireUserSessionLock(uId, "call", `pending_${Date.now()}`);
        if (!lockToken) {
          logger.info(`BUSY_LOCK_REJECTED: userId=${uId} sessionType=call`);
          return { locked: false };
        }
        heldLocks.push({ uId, token: lockToken });

        let isGenuinelyBusy = false;
        const rBusy = await redisService.getUserBusyStatus(uId);
        const uData = await User.findByPk(uId, { attributes: ["id", "isBusy", "isManualBusy"] });

        // A listener's do-not-disturb is a hard "no" for incoming requests and is never healed.
        if (isReceiver && uData?.isManualBusy) {
          logger.info(`BUSY_MANUAL_REJECTED: userId=${uId} sessionType=call`);
          return { locked: true, token: lockToken, busy: true, manual: true };
        }

        if (rBusy) {
          isGenuinelyBusy = true;
        } else if (uData?.isBusy) {
          isGenuinelyBusy = true;
        }

        if (isGenuinelyBusy) {
          logger.info(`BUSY_STATE_VERIFIED: checking DB for userId=${uId}`);
          const trulyBusy = await conversationService.isUserTrulyBusy(uId);

          if (trulyBusy.status === 'BUSY') {
            logger.info(`BUSY_LOCK_REJECTED: userId=${uId} sessionType=call`);
            return { locked: true, token: lockToken, busy: true };
          } else if (trulyBusy.status === 'CHECK_FAILED') {
            logger.error(`BUSY_STATE_CHECK_FAILED: userId=${uId} sessionType=call error=${trulyBusy.error?.message}`);
            return { locked: true, token: lockToken, busy: true, error: trulyBusy.error };
          } else if (trulyBusy.status === 'NOT_BUSY') {
            logger.info(`STALE_BUSY_STATE_HEALED: userId=${uId} sessionType=call`);
            // Nothing real backs the flag: release it (never touching manual busy) and tell clients.
            await conversationService.releaseBusyForSession({ userIds: [uId], io, force: true });
            isGenuinelyBusy = false;
          }
        }

        logger.info(`BUSY_LOCK_ACQUIRED: userId=${uId} sessionType=call`);
        return { locked: true, token: lockToken, busy: false };
      };

      // Cancel the caller's open (not yet started) request with `peerId` so a new one can be
      // made, e.g. switching an accepted chat request to a call. Returns true only when that
      // request was the caller's sole reason for being busy and it is now gone.
      const supersedeOpenRequestWith = async (peerId) => {
        const active = await conversationService.getActiveSessionFor(userId);
        if (!active || active.started || active.peerId !== peerId || !active.chatId) return false;

        logger.info(`Superseding open request ${active.requestId} between ${userId} and ${peerId} with a new ${serviceType} request`);
        if (active.requestId) {
          clearRingingTicker(active.requestId);
          await redisService.client.del(`call:${active.requestId}`);
        }
        await conversationService.releaseUnstartedRequestState(active.chatId, [userId, peerId], io);

        // Stop the old request's ringing / pending UI on the other side.
        io.to(`user:${peerId}`).emit("call-ended", { request_id: active.requestId, sender_id: userId, reason: "superseded" });
        pushService.sendCancelCallNotification(receiver, active.requestId)
          .catch((err) => logger.error(`[Push] cancel push for superseded request failed: ${err.message}`));

        const stillBusy = await conversationService.isUserTrulyBusy(userId);
        return stillBusy.status === "NOT_BUSY";
      };

      // 1. Lock the Caller
      let callerCheck = await verifyUserNotBusy(userId);
      // The caller's only open item is an unstarted request with this same person (e.g. a chat
      // request was accepted and they now tap "Call"): replace it instead of rejecting them as
      // busy with the very person they are trying to reach.
      if (callerCheck.locked && callerCheck.busy && !callerCheck.error && !callerCheck.manual) {
        if (await supersedeOpenRequestWith(receiver_id)) {
          callerCheck = { ...callerCheck, busy: false };
        }
      }
      if (!callerCheck.locked || callerCheck.busy) {
        if (callerCheck.token) await redisService.releaseUserSessionLock(userId, callerCheck.token);
        if (callerCheck.token) logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=call`);
        // No busy broadcast here: lock contention and failed checks are not evidence that the
        // caller is busy, and a real busy state was already broadcast when it began.
        const payload = !callerCheck.locked || callerCheck.error
          ? tryAgainError()
          : await callerInSessionError(conversationService, userId);
        return socket.emit("call-request:error", payload);
      }

      // 2. Lock the Receiver
      const receiverCheck = await verifyUserNotBusy(receiver_id, { isReceiver: true });
      if (!receiverCheck.locked || receiverCheck.busy) {
        await redisService.releaseUserSessionLock(userId, callerCheck.token);
        logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=call`);
        if (receiverCheck.token) await redisService.releaseUserSessionLock(receiver_id, receiverCheck.token);
        if (receiverCheck.token) logger.info(`BUSY_LOCK_RELEASED: userId=${receiver_id} sessionType=call`);
        return socket.emit(
          "call-request:error",
          !receiverCheck.locked || receiverCheck.error ? tryAgainError() : listenerBusyError()
        );
      }
      // ── End Atomic Busy Guard ────────────────────────────────────────────────

      try {
        // 2. Create chat + DB request record
        [chat, request_created] = await Promise.all([
          conversationService.createConversation(userId, receiver_id, serviceType),
          CallRequestService.sendCallRequest(userId, receiver_id, serviceType),
        ]);

        if (!request_created.success) {
          await redisService.releaseUserSessionLock(userId, callerCheck.token);
          await redisService.releaseUserSessionLock(receiver_id, receiverCheck.token);
          logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=call`);
          logger.info(`BUSY_LOCK_RELEASED: userId=${receiver_id} sessionType=call`);
          return socket.emit("call-request:error", { message: request_created.message });
        }
      } catch (dbError) {
        await redisService.releaseUserSessionLock(userId, callerCheck.token);
        await redisService.releaseUserSessionLock(receiver_id, receiverCheck.token);
        logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=call`);
        logger.info(`BUSY_LOCK_RELEASED: userId=${receiver_id} sessionType=call`);
        throw dbError; // Pass to the outer catch block
      }

      const request_id = request_created.request_id;
      const conversationId = chat.id;

      // 3. Generate Agora tokens + save Redis metadata
      busyMarked = true; // from here on a failure must release what this request is about to set
      const [agoraTokens] = await Promise.all([
        isMediaCall && agoraService.isConfigured()
          ? agoraService.generateCallTokens(conversationId, userId, receiver_id)
          : Promise.resolve(null),
        redisService.client.hSet(`call:${request_id}`, {
          conversationId,
          senderId: userId,
          receiverId: receiver_id,
          payerId,
          earnerId,
          serviceType,
          createdAt: new Date().toISOString(),
          callerSocketId: socket.id,
          balanceInfo: JSON.stringify(balanceValidation),
          status: "sent"
        }),
        redisService.client.hSet(`call:${conversationId}`, {
          conversationId,
          requestId: request_id, // reverse index so the Agora webhook can resolve request_id from channelName
          senderId: userId,
          receiverId: receiver_id,
          payerId,
          earnerId,
          serviceType,
          createdAt: new Date().toISOString(),
          callerSocketId: socket.id,
        }),
        redisService.setUserActiveInChat(userId, conversationId),
        redisService.setUserBusyStatus(userId, conversationId, serviceType),
        redisService.setUserBusyStatus(receiver_id, conversationId, serviceType),
        redisService.client.set(`socket_to_call:${socket.id}`, request_id, { EX: 7200 })
      ]);

      // Emit status changed
      emitStatus(io, "listener:status-changed", { listenerId: userId, isOnline: true, isBusy: true, busyType: serviceType }, socket.user.role);
      emitStatus(io, "listener:status-changed", { listenerId: receiver_id, isOnline: true, isBusy: true, busyType: serviceType }, receiver.role);

      // Update DB
      await User.update({ isBusy: true }, { where: { id: [userId, receiver_id] } });

      // Release acquisition locks
      await redisService.releaseUserSessionLock(userId, callerCheck.token);
      await redisService.releaseUserSessionLock(receiver_id, receiverCheck.token);
      logger.info(`BUSY_LOCK_RELEASED: userId=${userId} sessionType=call`);
      logger.info(`BUSY_LOCK_RELEASED: userId=${receiver_id} sessionType=call`);

      // 4. Notify Receiver — socket (foreground) + push (background/killed)
      const callType = serviceType === "video_call" || serviceType === "video" ? "video_call" : "audio_call";

      // Presence ("online") only says a socket id is registered in Redis; it can
      // be stale. Count the sockets actually in the room so we know whether the
      // emit below can reach anyone.
      const receiverRoom = `user:${receiver_id}`;
      const liveSockets = (await io.in(receiverRoom).fetchSockets()).length;
      const deliveryLog = `CALL_DELIVERY requestId=${request_id} from=${userId} to=${receiver_id} type=${serviceType} liveSockets=${liveSockets}`;
      if (liveSockets > 0) logger.info(deliveryLog);
      else logger.warn(deliveryLog);

      io.to(receiverRoom).emit("call-request-response", {
        request_id,
        request_type: serviceType,
        sender_name: callerName,
        senderId: userId,
        chatId: chat.id,
        conversationId: conversationId,
        balanceInfo: balanceValidation,
        agora: agoraTokens?.receiver ? {
          token: agoraTokens.receiver.token,
          channel: conversationId,
          uid: receiver_id,
          appId: agoraTokens.appId,
          expiresIn: agoraTokens.receiver.expiresIn
        } : null
      });

      // 5. Wake background/killed receiver via FCM or APNs VoIP push
      const pushPayload = {
        requestId: request_id,
        requestType: serviceType,
        senderId: userId,
        chatId: chat.id,
        channelName: conversationId,
        callerName,
        callType,
        agoraAppId: agoraService.appId || "",
        acceptedToken: agoraTokens?.receiver?.token || "",
        agoraUid: receiver_id,
        conversationId,
      };
      const sendIncomingPush = () =>
        pushService
          .sendIncomingCallNotification(receiver, pushPayload)
          .then((result) => {
            if (!result?.success) {
              logger.warn(`CALL_PUSH_FAILED requestId=${request_id} to=${receiver_id} channel=${result?.channel} reason=${result?.reason}`);
            }
            return result;
          })
          .catch((err) => {
            logger.error(`[Push] sendIncomingCallNotification failed: ${err.message}`);
            return { channel: "none", success: false, reason: err.message };
          });

      // 6. Auto-cancel an unanswered request: mark it missed, free both users, and
      //    tell the receiver's devices to stop ringing.
      const cancelUnansweredCall = async ({ reason, notifyReceiver }) => {
        // Claim the request first. If the receiver accepted (or the caller cancelled)
        // while we were getting here, the request is no longer pending and this
        // cleanup must not tear down the live call.
        const missed = await CallRequestService.missedCallRequest(request_id);
        if (missed?.alreadyHandled) {
          logger.info(`Call ${request_id} no longer pending (${missed.message}); skipping unanswered cleanup`);
          return false;
        }
        clearRingingTicker(request_id);
        await Promise.all([
          redisService.client.del(`call:${request_id}`),
          redisService.client.del(`call:${conversationId}`),
        ]);
        // Releases only what this request holds: a chat that started in the meantime keeps
        // its flags, and a manual do-not-disturb is never cleared.
        await conversationService.releaseBusyForSession({ conversationId, userIds: [userId, receiver_id], io });
        if (!notifyReceiver) return true;
        // Tell both caller and receiver that the request timed out
        const timeoutPayload = { request_id, request_type: serviceType, reason };
        io.to(`user:${userId}`).emit("call-timeout", timeoutPayload);
        io.to(receiverRoom).emit("call-timeout", timeoutPayload);
        // Step 1: Cancel push — stops the ringing UI/ringtone on the receiver's device
        pushService.sendCancelCallNotification(receiver, request_id)
          .catch((err) => logger.error(`[Push] cancel push on timeout failed: ${err.message}`));
        // Step 2: Missed call notification — OS renders a "Missed Call" banner in the
        // notification tray automatically; no custom client code required.
        pushService.sendMissedCallNotification(receiver, request_id, callerName, serviceType)
          .catch((err) => logger.error(`[Push] missed call notification on timeout failed: ${err.message}`));
        return true;
      };

      let pushResult = null;
      if (liveSockets > 0) {
        // Socket delivery is possible — push is a best-effort extra and must not
        // delay the caller's ack.
        sendIncomingPush();
      } else {
        // Nothing is listening on the socket, so the push is the only way to reach
        // the receiver. If it fails too, stop ringing the caller into the void.
        pushResult = await sendIncomingPush();
        if (!pushResult.success) {
          logger.warn(`CALL_UNDELIVERABLE requestId=${request_id} to=${receiver_id}: no live socket and push failed`);
          await cancelUnansweredCall({ reason: "undeliverable", notifyReceiver: false });
          return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.RECEIVER_OFFLINE });
        }
      }

      // 7. 30-second timeout — auto-cancel if receiver never accepts
      setTimeout(async () => {
        try {
          const callState = await redisService.client.hGet(`call:${request_id}`, "status");
          if (callState === "sent") {
            logger.info(`Call ${request_id} timed out after ${CALL_TIMEOUT_MS / 1000}s`);
            await cancelUnansweredCall({ reason: "no_answer", notifyReceiver: true });
          }
        } catch (err) {
          logger.error(`[Timeout] Error during call timeout cleanup for ${request_id}:`, err.message);
        }
      }, CALL_TIMEOUT_MS);

      socket.emit("call-request:sent", {
        request_id,
        receiver_id,
        status: "sent",
        totalSeconds: CALL_TIMEOUT_SECONDS,
        delivery: { socket: liveSockets, push: pushResult ? { channel: pushResult.channel, success: pushResult.success } : "async" },
      });
      // Start the per-second countdown so both sides can render a live timer
      startRingingTicker(io, request_id, userId, receiver_id);
      logger.info(`Call ${request_id} sent from ${userId} to ${receiver_id}`);
    } catch (error) {
      logger.error("Error in handleCallRequest:", error);
      // Undo only what this request did. Before the busy flags were set there is nothing to
      // clear — and clearing anyway would wipe the flags of a session that is really running.
      if (busyMarked && chat?.id) {
        try {
          await redisService.client.del(`call:${chat.id}`);
          if (request_created?.request_id) {
            await redisService.client.del(`call:${request_created.request_id}`);
            await CallRequestService.cancelCallRequest(request_created.request_id, { senderId: userId });
          }
          await conversationService.releaseBusyForSession({ conversationId: chat.id, userIds: [userId, receiver_id], io });
        } catch (cleanupError) {
          logger.error("Failed to roll back call request state:", cleanupError);
        }
      }
      socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.INTERNAL_SERVER_INIT });
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

  // ---------------------------------------------------------------------------
  // EVENT: call-request:accept — Receiver accepts; tokens sent; billing NOT yet started
  // ---------------------------------------------------------------------------
  socket.on("call-request:accept", async (data) => {
    const { request_id } = data;
    if (!request_id) return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.MISSING_REQUEST_ID });

    // True once this socket won the pending -> accepted transition in the DB.
    let acceptClaimed = false;
    try {
      // 1. Fetch metadata before changing request state so the receiver can
      // be authenticated against the Redis call record.
      const callData = await redisService.client.hGetAll(`call:${request_id}`);

      if (!callData || !callData.conversationId) {
        return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.NOT_FOUND_OR_EXPIRED });
      }

      if (String(callData.receiverId) !== String(userId)) {
        return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.UNAUTHORIZED_ACCEPT });
      }

      // Stop the ringing countdown — call is being answered
      clearRingingTicker(request_id);

      const acceptResponse = await CallRequestService.acceptCallRequest(request_id, userId);
      if (!acceptResponse.success) {
        return socket.emit("call-request:error", { message: acceptResponse.message });
      }
      acceptClaimed = true;

      const conversationId = callData.conversationId;
      const senderId = callData.senderId;
      const balanceInfo = JSON.parse(callData.balanceInfo || "null");
      const isMediaCall = callData.serviceType === "audio_call" || callData.serviceType === "video_call";

      // 2. Generate fresh Agora tokens for the accepted call
      const agoraTokens = isMediaCall && agoraService.isConfigured()
        ? await agoraService.generateCallTokens(conversationId, senderId, userId)
        : null;

      // 3. Update Redis — status = "accepted" (NOT "started" — billing not yet active)
      const updateData = { status: "accepted", acceptedAt: new Date().toISOString(), receiverSocketId: socket.id };
      await Promise.all([
        redisService.client.hSet(`call:${request_id}`, updateData),
        redisService.client.hSet(`call:${conversationId}`, updateData),
        redisService.client.set(`socket_to_call:${socket.id}`, request_id, { EX: 7200 }),
        chatService.getOrCreateChat(userId, senderId),
      ]);

      const activeChat = await chatService.getOrCreateChat(userId, senderId);

      // 4. Emit tokens to both so they can join Agora channel
      // Billing starts once the Agora NCS webhook (or call-connected fallback) reports
      // both participants are in the channel.
      const callerAcceptancePayload = {
        request_id,
        chatId: activeChat.id,
        senderId,
        receiverId: userId,
        conversationId,
        balanceInfo,
        agora: agoraTokens?.caller ? {
          token: agoraTokens.caller.token,
          channel: conversationId,
          uid: senderId,
          appId: agoraTokens.appId,
          expiresIn: agoraTokens.caller.expiresIn
        } : null
      };

      const receiverAcceptancePayload = {
        request_id,
        chatId: activeChat.id,
        senderId,
        receiverId: userId,
        conversationId,
        balanceInfo,
        agora: agoraTokens?.receiver ? {
          token: agoraTokens.receiver.token,
          channel: conversationId,
          uid: userId,
          appId: agoraTokens.appId,
          expiresIn: agoraTokens.receiver.expiresIn
        } : null
      };

      io.to(`user:${senderId}`).emit("call-request:accepted", callerAcceptancePayload);
      socket.emit("call-started", receiverAcceptancePayload);

      // Billing starts only after both clients confirm that they joined Agora
      // through call-connected or the Agora webhook.
      logger.info(`Call ${request_id} accepted. Waiting for both Agora participants to connect.`);

      // 5. Join timeout — auto-cancel if they fail to join Agora (only for media calls)
      if (isMediaCall) {
        const JOIN_TIMEOUT_MS = 30_000;
        const joinTimeoutKey = `call:${request_id}:join_timeout`;
        await redisService.client.set(joinTimeoutKey, "pending", { EX: 35 });

        setTimeout(async () => {
          try {
            const timeoutFlag = await redisService.client.get(joinTimeoutKey);
            if (timeoutFlag === "pending") {
              logger.warn(`Call ${request_id} join timeout: Participants failed to join Agora in time.`);
              const freshData = await redisService.client.hGetAll(`call:${request_id}`);
              if (freshData && freshData.status === "accepted") {
                await callLifecycle.endCall(request_id, freshData, "join_timeout");
                io.to(`user:${senderId}`).emit("call-ended", { request_id, reason: "join_timeout" });
                io.to(`user:${userId}`).emit("call-ended", { request_id, reason: "join_timeout" });
              }
            }
          } catch (err) {
            logger.error(`[Join Timeout] Error for ${request_id}:`, err);
          }
        }, JOIN_TIMEOUT_MS);
      } else {
        // 5b. Chat: the session starts with the first message. If nobody writes, release both
        // users instead of leaving the listener "busy" for everyone until the sweeper runs.
        setTimeout(async () => {
          try {
            const { Chat } = require("../../models");
            const [request, chat] = await Promise.all([
              CallRequest.findByPk(request_id, { attributes: ["id", "status"] }),
              Chat.findByPk(conversationId, { attributes: ["id", "status"] }),
            ]);
            if (request?.status !== "accepted" || chat?.status === "started") return;

            logger.info(`Chat request ${request_id} accepted but no message in ${CHAT_FIRST_MESSAGE_TIMEOUT_MS / 1000}s; releasing both users`);
            await conversationService.releaseUnstartedRequestState(conversationId, [senderId, userId], io);
            const payload = { request_id, chatId: activeChat.id, reason: "no_first_message" };
            io.to(`user:${senderId}`).emit("chat-request:expired", payload);
            io.to(`user:${userId}`).emit("chat-request:expired", payload);
          } catch (err) {
            logger.error(`[Chat First-Message Timeout] Error for ${request_id}:`, err);
          }
        }, CHAT_FIRST_MESSAGE_TIMEOUT_MS);
      }

    } catch (error) {
      logger.error("Error in call-request:accept:", error);
      if (acceptClaimed) {
        // The request is already `accepted` in the DB, so the ring timeout will no longer
        // clean it up. Tear the call down here or both users stay busy indefinitely.
        try {
          const staleCall = await redisService.client.hGetAll(`call:${request_id}`);
          await callLifecycle.endCall(request_id, staleCall, "accept_failed");
          if (staleCall?.senderId) {
            io.to(`user:${staleCall.senderId}`).emit("call-ended", { request_id, reason: "accept_failed" });
          }
        } catch (cleanupError) {
          logger.error(`Failed to clean up call ${request_id} after accept error:`, cleanupError);
        }
      }
      socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.INTERNAL_SERVER_ACCEPT });
    }
  });

  // ---------------------------------------------------------------------------
  // EVENT: call-connected — Frontend fast-path hint that it has joined Agora.
  // The Agora NCS webhook is the authoritative trigger; this remains as a fallback
  // and is idempotent (delegates to the same callLifecycle.markConnected).
  // ---------------------------------------------------------------------------
  socket.on("call-connected", async (data) => {
    const { request_id } = data;
    if (!request_id) return;

    try {
      const callData = await redisService.client.hGetAll(`call:${request_id}`);
      if (!callData?.conversationId) return;
      if (String(callData.senderId) !== String(userId) && String(callData.receiverId) !== String(userId)) {
        logger.warn(`Ignoring unauthorized call-connected signal for ${request_id} from ${userId}`);
        return;
      }
      if (callData.serviceType !== "audio_call" && callData.serviceType !== "video_call") return;
      await callLifecycle.markConnected(request_id, userId, { socketId: socket.id });
    } catch (error) {
      logger.error(`Error in call-connected for call ${request_id}:`, error);
    }
  });

  // ---------------------------------------------------------------------------
  // Ringing-state teardown shared by reject, cancel and call-end-while-ringing.
  // ---------------------------------------------------------------------------
  const releaseRingingParticipants = async (request_id, conversationId, senderId, receiverId) => {
    await Promise.all([
      redisService.client.del(`call:${request_id}`),
      conversationId ? redisService.client.del(`call:${conversationId}`) : null,
    ]);
    await conversationService.releaseBusyForSession({ conversationId, userIds: [senderId, receiverId], io });
  };

  // Only the receiver may reject, and only while the request is still pending.
  const rejectRingingCall = async (request_id) => {
    const response = await CallRequestService.rejectCallRequest(request_id, userId);
    if (!response.success) {
      socket.emit("call-request:error", { message: response.message });
      return false;
    }
    // Stop the ringing countdown only once the rejection is accepted
    clearRingingTicker(request_id);
    const callData = await redisService.client.hGetAll(`call:${request_id}`);
    await releaseRingingParticipants(request_id, callData?.conversationId, response.senderId, response.receiverId);
    io.to(`user:${response.senderId}`).emit("call-request:rejected", { request_id });
    logger.info(`Call request ${request_id} rejected`);
    return true;
  };

  // Only the caller may cancel, and only while the request is still pending.
  const cancelRingingCall = async (request_id) => {
    const response = await CallRequestService.cancelCallRequest(request_id, { senderId: userId });
    if (!response.success) {
      socket.emit("call-request:error", { message: response.message });
      return false;
    }
    // Stop the ringing countdown only once the cancellation is accepted
    clearRingingTicker(request_id);
    const callData = await redisService.client.hGetAll(`call:${request_id}`);
    await releaseRingingParticipants(request_id, callData?.conversationId, response.senderId, response.receiverId);

    const receiverId = response.receiverId;
    // Socket event (foreground receiver)
    io.to(`user:${receiverId}`).emit("call-ended", { request_id, sender_id: userId, reason: "cancelled" });

    // Push notification (background/killed receiver) — dismiss ringtone
    const receiverUser = await User.findOne({
      where: { id: receiverId },
      attributes: ["id", "fcmToken", "voipToken", "platform"],
    });
    if (receiverUser) {
      pushService.sendCancelCallNotification(receiverUser, request_id)
        .catch((err) => logger.error(`[Push] cancel push failed: ${err.message}`));
    }
    logger.info(`Call request ${request_id} cancelled by caller ${userId}`);
    return true;
  };

  // ---------------------------------------------------------------------------
  // EVENT: call-request:reject
  // ---------------------------------------------------------------------------
  socket.on("call-request:reject", async (data) => {
    const { request_id } = data || {};
    try {
      if (!request_id) return socket.emit("call-request:error", { message: WS_MESSAGES.CALLING.ERRORS.MISSING_REQUEST_ID });
      await rejectRingingCall(request_id);
    } catch (error) {
      logger.error("Error in call-request:reject:", error);
    }
  });

  // ---------------------------------------------------------------------------
  // EVENT: call-request:cancel — Caller cancels a pending (ringing) request
  // ---------------------------------------------------------------------------
  socket.on("call-request:cancel", async (data) => {
    const { request_id } = data || {};
    if (!request_id) return;
    try {
      await cancelRingingCall(request_id);
    } catch (error) {
      logger.error("Error in call-request:cancel:", error);
    }
  });

  // ---------------------------------------------------------------------------
  // EVENT: call-audio-toggle / call-video-toggle
  // ---------------------------------------------------------------------------
  socket.on("call-audio-toggle", (data) => {
    const { receiver_id, request_id, isMuted } = data;
    if (request_id) callDurationMonitor.recordActivity(request_id);
    io.to(`user:${receiver_id}`).emit("call-audio-toggled", { request_id, sender_id: userId, isMuted });
  });

  socket.on("call-video-toggle", (data) => {
    const { receiver_id, request_id, isVideoOff } = data;
    if (request_id) callDurationMonitor.recordActivity(request_id);
    io.to(`user:${receiver_id}`).emit("call-video-toggled", { request_id, sender_id: userId, isVideoOff });
  });

  // ---------------------------------------------------------------------------
  // EVENT: call-heartbeat — Periodic liveness signal from an in-call client.
  // Feeds the backend inactivity auto-end safety timer so a healthy call is never
  // auto-ended, while a fully-silent call (crashed clients) eventually is.
  // ---------------------------------------------------------------------------
  socket.on("call-heartbeat", (data) => {
    const { request_id } = data || {};
    if (request_id) callDurationMonitor.recordActivity(request_id);
  });

  // ---------------------------------------------------------------------------
  // EVENT: call-end — Frontend fast-path to end the call. Authoritative end also
  // comes from the Agora NCS webhook (104/102); both delegate to endCall.
  // ---------------------------------------------------------------------------
  socket.on("call-end", async (data) => {
    const { request_id } = data || {};
    if (!request_id) return;

    try {
      const callData = await redisService.client.hGetAll(`call:${request_id}`);
      if (!callData || !callData.conversationId) return;

      const isSender = String(callData.senderId) === String(userId);
      const isReceiver = String(callData.receiverId) === String(userId);
      if (!isSender && !isReceiver) {
        logger.warn(`Unauthorized call-end attempt requestId=${request_id} attemptedByUserId=${userId}`);
        return socket.emit("call-error", { message: "You are not a participant in this call" });
      }

      // Still ringing: there is no conversation to end. Ending is a cancel (caller) or a
      // reject (receiver) — routing it there closes the pending request, clears busy
      // state and stops the ringing ticker instead of leaving both users locked out.
      if (callData.status === "sent") {
        if (isSender) await cancelRingingCall(request_id);
        else await rejectRingingCall(request_id);
        return;
      }

      // Ends it and tells both users (from the stored call record) to leave the room now.
      await callLifecycle.endCallForAll(request_id, userId, "user_ended", callData);
    } catch (error) {
      logger.error("Error in call-end:", error);
    }
  });

  // ---------------------------------------------------------------------------
  // EVENT: disconnect — Handle unexpected disconnects with grace period
  // ---------------------------------------------------------------------------
  socket.on("disconnect", async () => {
    try {
      const requestId = await redisService.client.get(`socket_to_call:${socket.id}`);
      if (requestId) {
        await redisService.client.del(`socket_to_call:${socket.id}`);

        const callData = await redisService.client.hGetAll(`call:${requestId}`);
        if (callData && callData.conversationId) {
          const isCallerSocket = callData.callerSocketId === socket.id;

          // Fix: Clean up if user disconnects while call is in 'sent' or 'accepted' limbo state
          // For non-media service types, keep existing cancel behavior for "sent" but do nothing for "accepted".
          const isCallMedia = callData.serviceType === "audio_call" || callData.serviceType === "video_call";
          const shouldCancel = callData.status === "sent" || (callData.status === "accepted" && isCallMedia);

          if (shouldCancel && isCallerSocket) {
            clearRingingTicker(requestId);

            // The caller dropped while ringing or after accept-but-before-join, so both states are cancellable.
            await CallRequestService.cancelCallRequest(requestId, { statuses: ["pending", "accepted"] });
            await redisService.client.del(`call:${requestId}`);
            await redisService.client.del(`call:${callData.conversationId}`);
            await conversationService.releaseBusyForSession({
              conversationId: callData.conversationId,
              userIds: [callData.senderId, callData.receiverId],
              io,
            });
            io.to(`user:${callData.receiverId}`).emit("call-ended", { request_id: requestId, sender_id: callData.senderId, reason: "cancelled" });

            // Fix: Clean up ghost push notifications
            const receiverUser = await User.findByPk(callData.receiverId, {
              attributes: ["id", "fcmToken", "voipToken", "platform"],
            });
            if (receiverUser) {
              pushService.sendCancelCallNotification(receiverUser, requestId)
                .catch((err) => logger.error(`[Push] cancel push on disconnect failed: ${err.message}`));
            }
          } else {
            await callLifecycle.markDisconnected(requestId, userId, "socket_disconnect");
          }
        }
      }
    } catch (error) {
      logger.error("Error in disconnect cleanup:", error);
    }
    socket.leave(`user:${userId}`);
  });

  // ---------------------------------------------------------------------------
  // EVENT: user-online
  // ---------------------------------------------------------------------------
  socket.on("user-online", () => {
    socket.join(`user:${userId}`);
  });

  socket.on("ping", () => socket.emit("pong"));

  // ---------------------------------------------------------------------------
  // EVENT: check-listener-status
  // Client emits this before showing a "Call" / "Chat" button or on profile open
  // to get the listener's real-time availability without waiting for a broadcast.
  //
  // Emit:   check-listener-status  { listenerId: string }
  // Reply:  listener-status        { listenerId, isOnline, isBusy, busyType? }
  // ---------------------------------------------------------------------------
  socket.on("check-listener-status", async (data) => {
    const { listenerId } = data || {};
    if (!listenerId) return;

    try {
      const listener = await User.findByPk(listenerId, {
        attributes: ["id", "role"],
      });

      if (!listener || (listener.role !== "listener" && listener.role !== "astrologer")) {
        return socket.emit("listener-status", {
          listenerId,
          isOnline: false,
          isBusy: false,
        });
      }

      const [statusInfo, busyMap] = await Promise.all([
        redisService.getUserStatus(listenerId, listener.role),
        conversationService.getBusyInfo([listenerId], io),
      ]);
      const busyInfo = busyMap.get(listenerId) || { isBusy: false, type: null, since: null };

      socket.emit("listener-status", {
        listenerId,
        isOnline: statusInfo.isOnline,
        isBusy: busyInfo.isBusy,
        busyType: busyInfo.type,
        busySince: busyInfo.since,
      });
    } catch (err) {
      logger.error(`Error in check-listener-status for ${listenerId}:`, err.message);
      socket.emit("listener-status", { listenerId, isOnline: false, isBusy: false });
    }
  });
};
