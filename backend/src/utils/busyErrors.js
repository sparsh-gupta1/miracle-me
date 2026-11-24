const logger = require("./logger");
const WS_MESSAGES = require("../constants/websocket-messages.constants");

/**
 * Error payloads for the busy guards. The `error_code` tells the app *who* is busy, so a user
 * who is still in their own session is not shown every listener as busy:
 *  - CALLER_IN_SESSION: the requesting user is in (or has an open request for) another session
 *  - LISTENER_BUSY:     the other person is in a session / do-not-disturb
 *  - TRY_AGAIN:         a concurrent request held the setup lock; nobody is actually busy
 * `message` keeps the previous text so older app builds read it unchanged.
 */
const BUSY_ERROR_CODES = {
  CALLER_IN_SESSION: "CALLER_IN_SESSION",
  LISTENER_BUSY: "LISTENER_BUSY",
  TRY_AGAIN: "TRY_AGAIN",
};

/**
 * @param {object} conversationService - provides getActiveSessionFor(userId)
 * @param {string} userId - the busy requester
 * @returns {Promise<{message: string, error_code: string, activeSession: object|null}>}
 */
async function callerInSessionError(conversationService, userId) {
  let activeSession = null;
  try {
    activeSession = await conversationService.getActiveSessionFor(userId);
  } catch (err) {
    // The rejection stands either way; the session details are only a hint for the app.
    logger.warn(`Could not resolve active session for ${userId}: ${err.message}`);
  }
  return {
    message: WS_MESSAGES.CALLING.ERRORS.BUSY_IN_SESSION,
    error_code: BUSY_ERROR_CODES.CALLER_IN_SESSION,
    activeSession,
  };
}

const listenerBusyError = () => ({
  message: WS_MESSAGES.CALLING.ERRORS.LISTENER_BUSY,
  error_code: BUSY_ERROR_CODES.LISTENER_BUSY,
});

const tryAgainError = () => ({
  message: WS_MESSAGES.CALLING.ERRORS.TRY_AGAIN,
  error_code: BUSY_ERROR_CODES.TRY_AGAIN,
});

module.exports = { BUSY_ERROR_CODES, callerInSessionError, listenerBusyError, tryAgainError };
