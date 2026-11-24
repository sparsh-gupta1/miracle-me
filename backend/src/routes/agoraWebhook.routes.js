const express = require("express");
const router = express.Router();
const agoraWebhookController = require("../controllers/agoraWebhook.controller");

/**
 * @route   POST /api/agora/webhook
 * @desc    Agora Notification Center Service (NCS) callback — channel join/leave/destroy.
 *          Authoritative trigger for billing start/stop. No auth middleware: the
 *          request is authenticated via the Agora-Signature-V2 HMAC header instead.
 * @access  Public (signature-verified)
 */
router.post("/webhook", (req, res) => agoraWebhookController.handle(req, res));

module.exports = router;
