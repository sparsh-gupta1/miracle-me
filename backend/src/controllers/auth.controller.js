const { User } = require("../models");
const authService = require("../services/auth.service");
const { verifyGoogleToken } = require("../services/google.service");
const firebaseService = require("../services/firebase.service");
const logger = require("../utils/logger");

/**
 * Request OTP for authentication
 */
exports.requestOTP = async (req, res, next) => {
  try {
    const { mobileNumber, email, fcmToken, countryCode } = req.body;

    const result = await authService.findOrCreateUser(
      mobileNumber,
      email,
      fcmToken,
      countryCode
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Verify OTP and login
 */
exports.verifyOTP = async (req, res, next) => {
  try {
    const { uuid, otp, countryCode, verificationId } = req.body;

    const result = await authService.verifyOTP(uuid, otp, countryCode, verificationId);


    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.logoutUser = async (req, res, next) => {
  try {
    const { id } = req.user;
    const result = await authService.logout(id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.googleAuth = async (req, res, next) => {
  const { idToken } = req.body;
  try {
    const result = await verifyGoogleToken(idToken);
    const { googleId, email, name, picture } = result;

    let [user, created] = await User.findOrCreate({
      where: { googleId },
      defaults: {
        role: "user",
      },
    });

    if (created) {
      user.email = email;
      user.name = name;
      user.googleId = googleId;
      user.picture = picture;
      user.isVerified = true;
    }
    user.lastLogin = new Date();
    await user.save();
    const tokens = authService.generateTokens(user);

    res.status(201).json({ success: true, user, tokens });
  } catch (error) {
    logger.error("Google auth error: ", error);
    next(error);
  }
};

/**
 * Firebase Phone Auth – verify an idToken issued by the Firebase SDK
 * on iOS / Android, then find/create the user and return app JWT tokens.
 *
 * Request body: { idToken: string, fcmToken?: string }
 */
exports.firebasePhoneAuth = async (req, res, next) => {
  try {
    const { idToken, fcmToken } = req.body;

    // 1. Verify the Firebase ID token and extract the confirmed phone number
    const { phoneNumber } = await firebaseService.verifyFirebaseIdToken(idToken);

    // 2. Find/create user in DB and issue app JWT pair
    const result = await authService.firebasePhoneAuth(phoneNumber, fcmToken);

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

// admin panels APIs

exports.adminLogin = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const adminData = await authService.adminLoginService(email, password);
    res.json({ success: true, data: adminData });
  } catch (error) {
    next(error);
  }
};
