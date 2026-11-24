/**
 * Who may open a chat or call with whom. Shared by every path that creates a conversation,
 * so billing never sees a pair it cannot price (e.g. a "user" as the earner).
 *
 * Allowed: user ↔ listener/astrologer, and practitioner peers (listener ↔ listener,
 * astrologer ↔ astrologer).
 */
function assertCanCommunicate(role1, role2) {
  // 1. User cannot communicate with another User
  if (role1 === "user" && role2 === "user") {
    throw new Error("Users cannot communicate with each other");
  }

  // 2. Listener cannot communicate with Astrologer (and vice versa)
  if (
    (role1 === "listener" && role2 === "astrologer") ||
    (role1 === "astrologer" && role2 === "listener")
  ) {
    throw new Error("Listeners and Astrologers cannot communicate with each other");
  }
}

module.exports = { assertCanCommunicate };
