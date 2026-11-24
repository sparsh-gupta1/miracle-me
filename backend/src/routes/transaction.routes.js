const express = require("express");
const transactionController = require("../controllers/transaction.controller");
const {
  authenticate,
  requireRoles,
} = require("../middlewares/auth.middleware");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public/Broadly accessible routes
 */
router.post("/webhook", transactionController.handleWebhook);

/**
 * Authenticated routes
 */
router.use(authenticate);

router.post("/", mutationLimiter, transactionController.createTransaction);
router.post("/verify", mutationLimiter, transactionController.verifyPayment);
router.get("/my", transactionController.getMyTransactions);
router.get("/history", transactionController.getMyTransactions); // Mapping history to my transactions
router.get(
  "/recharge-records",
  requireRoles(["user", "listener", "astrologer"]),
  transactionController.getRechargeRecords
);
router.get("/wallet-history", transactionController.getWalletHistory);
router.post("/redeem", mutationLimiter, transactionController.createWithdrawalRequest);
router.post("/:transactionId/refund", mutationLimiter, transactionController.initiateRefund);

// admin only
router.get(
  "/",
  requireRoles(["admin"]),
  transactionController.getAllTransactions
);

module.exports = router;
