module.exports = {
  CALLING: {
    ERRORS: {
      MISSING_PARAMS: "Request type and receiver ID are required",
      CALL_SELF: "Cannot call yourself",
      USER_NOT_FOUND: "User not found",
      RECEIVER_OFFLINE: "Receiver is offline",
      BUSY_IN_SESSION: "You are currently busy in another session.",
      LISTENER_BUSY: "User is currently busy in another session. Please try again later.",
      TRY_AGAIN: "Please try again in a moment.",
      INTERNAL_SERVER_INIT: "Internal server error during call initiation",
      MISSING_REQUEST_ID: "Request ID is required",
      NOT_FOUND_OR_EXPIRED: "Call request not found or expired",
      UNAUTHORIZED_ACCEPT: "Only the receiving user can accept this call",
      INTERNAL_SERVER_ACCEPT: "Internal server error during call acceptance"
    }
  },
  NOTIFICATION: {
    ERRORS: {
      RECEIVER_NOT_FOUND: "Receiver not found"
    }
  }
};
