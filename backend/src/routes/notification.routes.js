const router = require("express").Router();

const notificationController = require("../controllers/notification.js");
const { authenticate } = require("../middlewares/auth.middleware");

router.post("/", notificationController.sendMessage);
router.post("/to-user/:receiver_id", authenticate, notificationController.sendToUser);

module.exports = router;
