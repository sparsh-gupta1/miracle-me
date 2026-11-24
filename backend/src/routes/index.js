const express = require("express");
const authRoutes = require("./auth.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/user", require("./user.routes"));
router.use("/experts", require("./expert.routes"));
router.use("/wallet", require("./wallet.routes"));
router.use("/sessions", require("./sessions.routes"));
router.use("/chats", require("./chat.routes"));
router.use("/notification", require("./notification.routes"));
router.use("/documents", require("./document.routes"));
router.use("/payments", require("./payment.routes"));
router.use("/transactions", require("./transaction.routes"));
router.use("/pricing", require("./pricing.routes"));
router.use("/free-minutes", require("./freeMinutes.routes"));
router.use("/agora", require("./agora.routes"));
router.use("/agora", require("./agoraWebhook.routes"));
router.use("/commissions", require("./commission.routes"));
router.use("/billing", require("./billing.routes"));
router.use("/listener", require("./billing.routes")); // Mapping /listener to billing routes for earnings
router.use("/announcements", require("./announcement.routes"));
router.use("/bank-info", require("./bankInfo.routes"));
router.use("/intro-video", require("./introVideo.routes"));
router.use("/dashboard", require("./dashboard.routes"));
router.use("/logs", require("./log.routes"));

module.exports = router;
