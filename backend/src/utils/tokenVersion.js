/**
 * True when the token was issued before the user's sessions were revoked
 * (an admin force logout bumps users.token_version). Tokens issued before
 * token versions existed have no "tv" and count as version 0.
 *
 * Kept dependency-free: config/websocket.js needs it, and requiring it from
 * auth.middleware.js there forms a require cycle (auth.middleware -> config ->
 * websocket) that left it undefined and rejected every socket handshake.
 */
const isTokenRevoked = (decoded, user) =>
  Boolean(user) && (decoded.tv || 0) !== (user.tokenVersion || 0);

module.exports = { isTokenRevoked };
