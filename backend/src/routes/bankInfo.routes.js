const express = require("express");
const bankInfoController = require("../controllers/bankInfo.controller");
const {
    authenticate,
    requireRoles,
    requireAdmin,
} = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validation.middleware");
const { bankInfoSchema } = require("../utils/validation-schemas");

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// ========== ASTROLOGER / LISTENER ROUTES ==========

/**
 * @route   POST /api/v1/bank-info
 * @desc    Submit or update bank info
 * @access  Astrologer / Listener
 */
router.post(
    "/",
    requireRoles(["astrologer", "listener"]),
    validate(bankInfoSchema),
    bankInfoController.submitBankInfo
);

/**
 * @route   GET /api/v1/bank-info/me
 * @desc    Get own bank info
 * @access  Astrologer / Listener
 */
router.get(
    "/me",
    requireRoles(["astrologer", "listener"]),
    bankInfoController.getMyBankInfo
);


// ========== ADMIN ROUTES ==========

/**
 * @route   GET /api/v1/bank-info
 * @desc    Get all bank infos with optional filters
 * @access  Admin
 */
router.get(
    "/",
    requireAdmin,
    bankInfoController.getAllBankInfos
);

/**
 * @route   GET /api/v1/bank-info/:userId
 * @desc    Get specific user's bank info
 * @access  Admin
 */
router.get(
    "/:userId",
    requireAdmin,
    bankInfoController.getUserBankInfo
);

/**
 * @route   PATCH /api/v1/bank-info/:userId/verify
 * @desc    Verify a user's bank info
 * @access  Admin
 */
router.patch(
    "/:userId/verify",
    requireAdmin,
    bankInfoController.verifyBankInfo
);

module.exports = router;
