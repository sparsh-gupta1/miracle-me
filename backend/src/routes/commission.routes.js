const express = require("express");
const router = express.Router();
const commissionController = require("../controllers/commission.controller");
const {
    authenticate,
    requireAdmin,
} = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validation.middleware");
const {
    createCommissionSchema,
    updateCommissionSchema,
    calculateCommissionSchema,
} = require("../utils/validation-schemas");

// Apply authentication to all routes
router.use(authenticate);

// ========== ADMIN ROUTES - COMMISSION MANAGEMENT ==========

/**
 * @route   POST /api/v1/commissions
 * @desc    Create a new commission rule
 * @access  Admin
 */
router.post(
    "/",
    requireAdmin,
    validate(createCommissionSchema),
    commissionController.createCommissionRule
);

/**
 * @route   PUT /api/v1/commissions/:ruleId
 * @desc    Update a commission rule
 * @access  Admin
 */
router.put(
    "/:ruleId",
    requireAdmin,
    validate(updateCommissionSchema),
    commissionController.updateCommissionRule
);

/**
 * @route   GET /api/v1/commissions
 * @desc    Get all commission rules with optional filters (role, serviceType)
 * @access  Admin
 */
router.get(
    "/",
    requireAdmin,
    commissionController.getCommissionRules
);

/**
 * @route   GET /api/v1/commissions/current
 * @desc    Get all current active commissions
 * @access  Admin
 */
router.get(
    "/current",
    requireAdmin,
    commissionController.getAllCurrentCommissions
);

/**
 * @route   GET /api/v1/commissions/current/:role/:serviceType
 * @desc    Get current active commission for specific role and service type
 * @access  Admin
 */
router.get(
    "/current/:role/:serviceType",
    requireAdmin,
    commissionController.getCurrentCommission
);

/**
 * @route   POST /api/v1/commissions/calculate
 * @desc    Calculate commission for a given amount
 * @access  Admin
 */
router.post(
    "/calculate",
    requireAdmin,
    validate(calculateCommissionSchema),
    commissionController.calculateCommission
);

module.exports = router;
