const router = require("express").Router();
const multer = require("multer");

const chatController = require("../controllers/chat.controller");
const userController = require("../controllers/user.controller");
const { authenticate, requireRoles } = require("../middlewares/auth.middleware");
const { validate, validateQuery } = require("../middlewares/validation.middleware");
const { adminCreateUserSchema, adminUpdateUserSchema, adminUserListQuerySchema } = require("../utils/validation-schemas");
const { upload } = require("../config/multer");
const { parseJsonFields, validateFile } = require("../middlewares/multipart.middleware");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a multer middleware so that multer errors are forwarded
 * to Express's next(err) error handler instead of crashing.
 */
const multerUpload = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (!err) return next();
    err.name = "ValidationError";
    err.errors = [{ message: err.message, path: [err.field ?? "file"], type: err instanceof multer.MulterError ? "file.multer" : "file.invalid" }];
    return next(err);
  });
};

/**
 * Coerces string form-data fields to their expected numeric types
 * before Joi validation (multipart/form-data sends everything as strings).
 */
const coerceNumberFields = (fields = []) => (req, res, next) => {
  for (const field of fields) {
    if (req.body[field] !== undefined && req.body[field] !== "") {
      const num = Number(req.body[field]);
      if (!isNaN(num)) req.body[field] = num;
    }
  }
  next();
};

// ---------------------------------------------------------------------------
// Reusable middleware stacks
// ---------------------------------------------------------------------------

const PROFILE_IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Middleware pipeline for POST /create (multipart/form-data) */
const adminCreateUserMiddleware = [
  requireRoles(["admin"]),
  multerUpload(upload.single("profileImage")),
  validateFile({ fieldName: "profileImage", required: true, allowedMimes: PROFILE_IMAGE_MIMES, maxSize: 5 * 1024 * 1024 }),
  parseJsonFields(["language", "profile"]),
  coerceNumberFields(["role", "age", "rating"]),
  validate(adminCreateUserSchema),
];

/** Middleware pipeline for PATCH /:userid/profile (multipart/form-data, all fields optional) */
const adminUpdateUserMiddleware = [
  requireRoles(["admin"]),
  multerUpload(upload.single("profileImage")),
  validateFile({ fieldName: "profileImage", required: false, allowedMimes: PROFILE_IMAGE_MIMES, maxSize: 5 * 1024 * 1024 }),
  parseJsonFields(["language", "profile"]),
  coerceNumberFields(["age", "rating"]),
  validate(adminUpdateUserSchema),
];

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.use(authenticate);

router.route("/me").get(userController.getMe).patch(userController.updateMe);

// Chat
router.get("/:userId/status", chatController.getUserStatusOnline);
router.get("/:roleid/search", chatController.newUserForChat);
router.get("/", userController.getUserDetails);

// User
router.post("/change-name", requireRoles(["admin", "listener", "astrologer"]), userController.changeUserNameByChatId);
router.delete("/account", userController.deleteAccount);
router.delete("/:userid", requireRoles(["admin"]), userController.deleteUser);

router.route("/block-user")
  .get(userController.blockUserList)
  .post(userController.blockUserByUserID);

router.route("/profile")
  .get(userController.getUserProfile);

router.route("/profile/:userId")
  .get(userController.getUserProfile);

router.route("/favorites")
  .get(userController.getFavorites)
  .post(userController.toggleFavorite);

router.route("/availability")
  .get(userController.getAvailability)
  .post(requireRoles(["admin", "listener", "astrologer"]), userController.updateAvailability);

router.post("/busy-status", requireRoles(["admin", "listener", "astrologer"]), userController.updateBusyStatus);

/**
 * POST /api/users/push-token
 * Mobile app registers/refreshes FCM + VoIP push tokens.
 * Must be called on login and whenever the OS rotates the token.
 * Body: { fcmToken, voipToken (iOS only), platform: "android"|"ios" }
 */
router.post("/push-token", userController.updatePushToken);

// Admin panel
router.route("/:roleid/admin-panel")
  .get(requireRoles(["admin"]), validateQuery(adminUserListQuerySchema), userController.getUserRoleWise);

// Log the user out of all devices (revokes their tokens and disconnects sockets)
router.post("/:userid/force-logout", requireRoles(["admin"]), userController.forceLogoutUser);

router.route("/:userid/active-status")
  .patch(requireRoles(["admin"]), userController.activeInactiveUser);

router.route("/create")
  .post(adminCreateUserMiddleware, userController.adminCreateUser);

router.route("/:userid/profile")
  .patch(adminUpdateUserMiddleware, userController.adminUpdateUser);

module.exports = router;
