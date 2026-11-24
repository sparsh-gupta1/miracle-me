const express = require("express");
const router = express.Router();
const freeMinutesController = require("../controllers/freeMinutes.controller");
const {
  authenticate,
  requireRoles,
} = require("../middlewares/auth.middleware");

// Admin routes
router.post(
  "/",
  authenticate,
  requireRoles(["admin"]),
  freeMinutesController.setFreeMinutesConfig.bind(freeMinutesController),
);

router.get(
  "/",
  authenticate,
  requireRoles(["admin"]),
  freeMinutesController.getAllConfigs.bind(freeMinutesController),
);

// User routes
router.get(
  "/my-usage",
  authenticate,
  freeMinutesController.getMyUsage.bind(freeMinutesController),
);

router.get(
  "/my-usage/:serviceType",
  authenticate,
  freeMinutesController.getMyUsageByServiceType.bind(freeMinutesController),
);

router.get(
  "/:serviceType",
  authenticate,
  requireRoles(["admin"]),
  freeMinutesController.getConfigByServiceType.bind(freeMinutesController),
);

router.delete(
  "/:serviceType",
  authenticate,
  requireRoles(["admin"]),
  freeMinutesController.disableFreeMinutes.bind(freeMinutesController),
);

module.exports = router;
