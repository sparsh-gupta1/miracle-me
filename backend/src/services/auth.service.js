const jwt = require("jsonwebtoken");
const { User, UserMetadata } = require("../models");
const logger = require("../utils/logger");
const config = require("../config");
const verifyService = require("./verify.service");

// Fixed OTPs for test mobile numbers (used for App Store / QA review).
// SMS is never sent for these numbers, OTP is just validated against this map.
const TEST_MOBILE_OTPS = {
  9999999999: "1234", // Test user
  8888888888: "1234", // Test user
  3333333333: "1234", // Test astrologer
  1111111111: "1234", // Test listener
};

exports.generateOTP = () => {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  return {
    otp,
    otpExpiry,
  };
};

/**
 * Request OTP for mobile authentication
 * @param {string} mobileNumber - User's mobile number
 * @param {string} email - User's email
 * @param {string} fcmToken - FCM token for push notifications (optional)
 * @param {string} countryCode - Country code without + (optional, default 91)
 * @returns {Object} - Status of OTP request
 */
exports.findOrCreateUser = async (
  mobileNumber,
  email,
  fcmToken = null,
  countryCode = "91",
) => {
  let query = {};
  let isMobileNumber = false;

  if (mobileNumber) {
    query = { mobileNumber, isActive: true };
    isMobileNumber = true;
  } else {
    query = { email };
  }

  try {
    let [user, created] = await User.findOrCreate({
      where: query,
      defaults: {
        role: "user",
        fcmToken,
      },
    });

    if (!created) {
      if (user.isActive === false) {
        const error = new Error(
          "User account is deactivated. Please contact support.",
        );
        error.name = "ForbiddenError";
        throw error;
      }

      // Update FCM token on every login for existing users
      if (fcmToken && user.fcmToken !== fcmToken) {
        user.fcmToken = fcmToken;
        await user.save();
      }

      await UserMetadata.upsert({
        userId: user.id,
        metadata: { betaAccess: false },
      });
    }

    // Ensure wallet exists for the user
    try {
      const walletService = require("./wallet.service");
      await walletService.ensureUserWallets(user.id, user.role);
    } catch (walletError) {
      logger.error(
        `Failed to ensure wallets for user ${user.id}:`,
        walletError,
      );
      // Don't throw here to avoid blocking login if wallet creation fails
    }

    const testOtp = isMobileNumber ? process.env.DEMO_OTP || TEST_MOBILE_OTPS[mobileNumber] : null;

    if (testOtp) {
      // Fixed OTP for test numbers - never expires within 10 minutes, no SMS sent
      user.otp = testOtp;
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
    } else if (
      !user.otp ||
      !user.isValidOTP(user.otp) ||
      user.otp.length !== 4
    ) {
      // Generate and save OTP locally for all users
      // Force 4-digit OTP even if an old valid 6-digit one exists
      const { otp, otpExpiry } = this.generateOTP();
      user.otp = otp;
      user.otpExpiry = otpExpiry;
      await user.save();
    }

    let result;
    let isSMS = config.sms.enable;
    if (isMobileNumber) {
      // Bypass SMS provider and print OTP to console
      if (isSMS && !testOtp) {
        result = await verifyService.sendOtp(
          mobileNumber,
          countryCode,
          user.otp,
        );
      }
      logger.debug("\n-----------------------------------------");
      logger.debug(`OTP for mobile ${mobileNumber}: ${user.otp}`);
      logger.debug("-----------------------------------------\n");
      logger.debug(`OTP for ${mobileNumber} is ${user.otp} (By-passed SMS)`);
    } else {
      logger.debug(`OTP for ${email}: ${user.otp}`);
    }

    return {
      success: true,
      message: "OTP sent successfully",
      userId: user.id,
      isNewUser: created,
      result,
    };
  } catch (error) {
    logger.error("Failed to send OTP:", error);
    throw new Error(error.message || "Failed to send OTP. Please try again.");
  }
};

/**
 * Verify OTP and authenticate user
 * @param {string} uuid - User ID
 * @param {string} otp - One-time password
 * @param {string} countryCode - Country code (optional)
 * @returns {Object} - User data and tokens
 */
exports.verifyOTP = async (uuid, otp, countryCode = "91", verificationId) => {
  // Find user by ID
  const user = await User.findOne({ where: { id: uuid } });
  if (!user) {
    const error = new Error("User not found");
    error.name = "NotFoundError";
    throw error;
  }

  if (verificationId) {
    const result = await verifyService.validateOtp(verificationId, otp);
    if (!result.success) {
      const error = new Error("Invalid or expired OTP");
      error.name = "UnauthorizedError";
      throw error;
    }
  } else {
    // Validate OTP locally (Bypassing SMS provider verification for development)
    const isOtpValid = user.isValidOTP(otp);

    if (!isOtpValid) {
      const error = new Error("Invalid or expired OTP");
      error.name = "UnauthorizedError";
      throw error;
    }
  }

  // Clear local OTP and mark as verified
  user.otp = null;
  user.otpExpiry = null;
  user.isVerified = true;
  user.lastLogin = new Date();
  await user.save();

  // Ensure wallets exist (fallback for existing users)
  try {
    const walletService = require("./wallet.service");
    await walletService.ensureUserWallets(user.id, user.role);
  } catch (walletError) {
    logger.error(
      `Failed to ensure wallets for user ${user.id} during login:`,
      walletError,
    );
  }

  // Generate tokens
  const tokens = this.generateTokens(user);

  return {
    user: user.toJSON(),
    tokens,
  };
};

/**
 * Find or create a user by a Firebase-verified phone number, then issue JWT tokens.
 *
 * Firebase already performed on-device OTP verification, so this function
 * trusts the phone number and never touches the local otp/otpExpiry columns.
 *
 * @param {string} phoneNumber  E.164 format from Firebase, e.g. "+919876543210"
 * @param {string} [fcmToken]  Optional FCM device push-notification token
 * @returns {{ user: Object, tokens: Object, isNewUser: boolean }}
 */
exports.firebasePhoneAuth = async (phoneNumber, fcmToken = null) => {
  // Strip the leading country code so the DB stores just the local number
  // consistently with the existing request-otp / verify-otp flow.
  // E.g. "+919876543210" → "9876543210"  (handles both "+91xxx" and "+1xxx")
  const mobileNumber = phoneNumber.replace(/^\+\d{1,3}/, "");

  try {
    // Same lookup as findOrCreateUser: a deactivated old account must not block re-registration.
    let [user, created] = await User.findOrCreate({
      where: { mobileNumber, isActive: true },
      defaults: {
        role: "user",
        fcmToken,
      },
    });

    if (!created && user.isActive === false) {
      const error = new Error(
        "User account is deactivated. Please contact support.",
      );
      error.name = "ForbiddenError";
      throw error;
    }

    // Update push-notification token when it changes
    if (!created && fcmToken && user.fcmToken !== fcmToken) {
      user.fcmToken = fcmToken;
    }

    if (created) {
      await UserMetadata.upsert({
        userId: user.id,
        metadata: { betaAccess: false },
      });
    }

    // Firebase has already confirmed the OTP → mark user as verified
    user.isVerified = true;
    user.lastLogin = new Date();
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // Ensure wallets exist
    try {
      const walletService = require("./wallet.service");
      await walletService.ensureUserWallets(user.id, user.role);
    } catch (walletError) {
      logger.error(
        `Failed to ensure wallets for user ${user.id} (firebase-phone):`,
        walletError,
      );
    }

    const tokens = this.generateTokens(user);

    return { user: user.toJSON(), tokens, isNewUser: created };
  } catch (error) {
    logger.error("firebasePhoneAuth error:", error);
    throw error;
  }
};

/**
 * Admin login with email and password
 * @param {string} email - Admin email
 * @param {string} password - Admin password
 * @returns {Object} - User data and tokens
 */
exports.adminLogin = async (email, password) => {
  // Find admin user by email
  const user = await User.findOne({
    where: {
      email,
      role: "admin",
    },
  });

  if (!user) {
    const error = new Error("Invalid email or password");
    error.name = "UnauthorizedError";
    throw error;
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    const error = new Error("Invalid email or password");
    error.name = "UnauthorizedError";
    throw error;
  }

  // Update last login time
  user.lastLogin = new Date();
  await user.save();

  // Generate tokens
  const tokens = this.generateTokens(user);

  return {
    user: user.toJSON(),
    tokens,
  };
};

/**
 * Create a listener account
 * @param {Object} listenerData - Listener registration data
 * @param {string} adminId - Admin user ID performing the action
 * @returns {Object} - Created listener data
 */
exports.createListener = async (listenerData, adminId) => {
  // Verify admin user
  const admin = await User.findOne({
    where: {
      id: adminId,
      role: "admin",
    },
  });

  if (!admin) {
    const error = new Error("Unauthorized to create listener");
    error.name = "ForbiddenError";
    throw error;
  }

  // One active account per mobile number (any role); deactivated numbers may be reused.
  const existingUser = await User.findOne({
    where: { mobileNumber: listenerData.mobileNumber, isActive: true },
  });

  if (existingUser) {
    const error = new Error("Mobile number already in use");
    error.name = "ValidationError";
    throw error;
  }

  // Create listener user
  const listener = await User.create({
    ...listenerData,
    role: "listener",
    isVerified: true, // Pre-verified by admin
  });

  // Ensure wallets for the new listener
  try {
    const walletService = require("./wallet.service");
    await walletService.ensureUserWallets(listener.id, "listener");
  } catch (walletError) {
    logger.error(
      `Failed to ensure wallets for new listener ${listener.id}:`,
      walletError,
    );
  }

  return listener.toJSON();
};

/**
 * Refresh access token
 * @param {string} refreshToken - Refresh token
 * @returns {Object} - New tokens
 */
exports.refreshAccessToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

    // Find user
    const user = await User.findByPk(decoded.id);
    // A refresh token issued before an admin force logout carries an old token version.
    if (!user || !user.isActive || (decoded.tv || 0) !== (user.tokenVersion || 0)) {
      const error = new Error("Invalid refresh token");
      error.name = "UnauthorizedError";
      throw error;
    }

    // Generate new tokens
    const tokens = this.generateTokens(user);

    return { tokens };
  } catch (error) {
    const err = new Error("Invalid refresh token");
    err.name = "UnauthorizedError";
    throw err;
  }
};

/**
 * Generate access and refresh tokens for a user
 * @param {Object} user - User object
 * @returns {Object} - Access and refresh tokens
 */
exports.generateTokens = (user) => {
  const accessToken = jwt.sign(
    {
      id: user.id,
      mobileNumber: user.mobileNumber,
      role: user.role,
      tv: user.tokenVersion || 0,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiry },
  );

  const refreshToken = jwt.sign({ id: user.id, tv: user.tokenVersion || 0 }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  });

  return { accessToken, refreshToken };
};

exports.logout = async (userId) => {
  const user = await User.findByPk(userId);
  if (user) {
    user.fcmToken = null;
    await user.save();

    if (user.role === "listener" || user.role === "astrologer") {
      const userService = require("./user.service");
      await userService.updateAvailability(userId, false);
      
      try {
        const { getIO } = require("../config/websocket");
        const io = getIO();
        if (io) {
          io.emit("listener:status-changed", {
            listenerId: userId,
            isOnline: false,
            isBusy: user.isBusy,
          });
        }
      } catch (err) {
        // io might not be initialized during some tests, ignore
      }
    }
  }
};

// admin login

exports.adminLoginService = async (email, password) => {
  // Find admin user by email
  const user = await User.findOne({
    where: {
      email,
      role: "admin",
    },
  });
  if (!user) {
    const error = new Error("Invalid email or password");
    error.name = "UnauthorizedError";
    throw error;
  }
  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    const error = new Error("Invalid email or password");
    error.name = "UnauthorizedError";
    throw error;
  }
  // Update last login time
  user.lastLogin = new Date();
  await user.save();
  // Generate tokens
  const tokens = this.generateTokens(user);
  return {
    user: user.toJSON(),
    tokens,
  };
};
