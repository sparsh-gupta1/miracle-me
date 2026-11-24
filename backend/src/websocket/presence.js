// Users can only talk to listeners/astrologers (utils/communicationRules.js), so a user's
// status is only useful to them and to admins. Sending it to every socket made each user
// connect/disconnect cost O(connected sockets).
const USER_STATUS_AUDIENCE = ["role:listener", "role:astrologer", "role:admin"];

/**
 * Emit a status event to the clients that can use it. Events about a regular user go to the
 * practitioner and admin rooms; everything else (or an unknown role) goes to everyone.
 * @param {object} target - Socket.IO server, or a socket to exclude that socket itself
 * @param {string} event - e.g. "user-status-changed" or "listener:status-changed"
 * @param {object} payload
 * @param {string|null|undefined} aboutRole - role of the user the event is about
 */
function emitStatus(target, event, payload, aboutRole) {
  if (aboutRole === "user") {
    target.to(USER_STATUS_AUDIENCE).emit(event, payload);
  } else {
    (target.broadcast || target).emit(event, payload);
  }
}

module.exports = { emitStatus, USER_STATUS_AUDIENCE };
