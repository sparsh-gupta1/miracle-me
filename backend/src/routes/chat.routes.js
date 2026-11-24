const { authenticate } = require("../middlewares/auth.middleware");

const router = require("express").Router();

router.use(authenticate);

const chatController = require("../controllers/chat.controller");
const { uploadSingleFile } = require("../config/multer");
router.get("/", chatController.getUserChat);
router.post("/", chatController.getAnotherUserChat);
router.get("/:chatId/messages", chatController.getMessageInChat);
router.post("/:chatId/messages", chatController.sendMessageInChat);
router.patch("/:chatId/read", chatController.markAsReadMessage);
router.delete("/messages/:messageId", chatController.deleteMessage);
router.get("/:chatId/search", chatController.searchMessageInChat);
router.get("/unread-counts", chatController.getUnreadMessageCount);

// upload media
router.post("/media", uploadSingleFile, chatController.uploadMedia);
module.exports = router;
