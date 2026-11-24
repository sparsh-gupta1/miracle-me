const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboard.controller");
const {
    authenticate,
    requireAdmin,
} = require("../middlewares/auth.middleware");
const { validateQuery } = require("../middlewares/validation.middleware");
const {
    dashboardRangeSchema,
    dashboardTrendSchema,
    dashboardTopPractitionersSchema,
} = require("../utils/validation-schemas");

// All dashboard routes are admin only. Every endpoint accepts optional
// ?from=&to= ISO dates (defaults to the last 30 days).
router.use(authenticate, requireAdmin);

/**
 * @route   GET /api/dashboard/overview
 * @desc    KPI cards (users, revenue, activity) with previous-period comparison
 * @access  Admin
 */
router.get("/overview", validateQuery(dashboardRangeSchema), dashboardController.getOverview);

/**
 * @route   GET /api/dashboard/trends?metric=&interval=day|week|month
 * @desc    Time series for charts, bucketed in IST
 * @access  Admin
 */
router.get("/trends", validateQuery(dashboardTrendSchema), dashboardController.getTrend);

/**
 * @route   GET /api/dashboard/sessions
 * @desc    Billed sessions by service type (minutes, free minutes, spend)
 * @access  Admin
 */
router.get("/sessions", validateQuery(dashboardRangeSchema), dashboardController.getSessionBreakdown);

/**
 * @route   GET /api/dashboard/requests
 * @desc    Chat/call request funnel (accepted, missed, rejected, time to accept)
 * @access  Admin
 */
router.get("/requests", validateQuery(dashboardRangeSchema), dashboardController.getRequestFunnel);

/**
 * @route   GET /api/dashboard/practitioners/top?sortBy=&role=&limit=
 * @desc    Listener/astrologer leaderboard
 * @access  Admin
 */
router.get("/practitioners/top", validateQuery(dashboardTopPractitionersSchema), dashboardController.getTopPractitioners);

/**
 * @route   GET /api/dashboard/finance
 * @desc    Money in vs. spend vs. payouts, plus wallet liability
 * @access  Admin
 */
router.get("/finance", validateQuery(dashboardRangeSchema), dashboardController.getFinance);

module.exports = router;
