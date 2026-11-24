const express = require("express");
const { validate } = require("../middlewares/validation.middleware");
const { authenticate } = require("../middlewares/auth.middleware");
const {
  googleAuth,
  logoutUser,
  adminLogin,
  requestOTP,
  verifyOTP,
  firebasePhoneAuth,
} = require("../controllers/auth.controller");
const { sendOtp, validateOtp } = require("../controllers/verify.controller");
const {
  adminLoginSchema,
  listenerSchema,
  googleAuthSchema,
  sendOtpSchema,
  validateOtpSchema,
  verifyOTPSchema,
  requestOTPSchema,
  firebasePhoneAuthSchema,
} = require("../utils/validation-schemas");
const rateLimit = require("express-rate-limit");

const router = express.Router();

// Rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.DEMO_MODE === "true" ? 1000 : 20, // 20 requests per window (relaxed in demo mode)
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post("/firebase-phone", authLimiter, validate(firebasePhoneAuthSchema), firebasePhoneAuth);
router.post("/request-otp", authLimiter, validate(requestOTPSchema), requestOTP);
router.post("/verify-otp", authLimiter, validate(verifyOTPSchema), verifyOTP);
router.post("/refresh", authLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ message: "refreshToken is required" });
    res.json({ success: true, data: await require("../services/auth.service").refreshAccessToken(refreshToken) });
  } catch (error) {
    next(error);
  }
});
router.post("/google", validate(googleAuthSchema), googleAuth);

// admin routes
router.post("/admin-login", authLimiter, validate(adminLoginSchema), adminLogin);

// Private routes
router.use(authenticate);
router.put("/logout", logoutUser);
router.post("/listener-login", validate(listenerSchema), requestOTP);
module.exports = router;
