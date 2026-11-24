const express = require("express");
const paymentController = require("../controllers/payment.controller");
const { authenticate, verifyActive } = require("../middlewares/auth.middleware");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many payment requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/order", paymentLimiter, authenticate, verifyActive, paymentController.createOrder);
router.post("/verify", paymentLimiter, authenticate, verifyActive, paymentController.verifyPayment);

module.exports = router;
