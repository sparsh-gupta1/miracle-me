const { oauth2Client } = require("../config/google");

exports.verifyGoogleToken = async (token) => {
  const ticket = await oauth2Client.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
};
