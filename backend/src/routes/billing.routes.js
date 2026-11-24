const express = require("express");
const billingController = require("../controllers/billing.controller");
const { authenticate } = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/usage", billingController.getUsageDashboard);
router.get("/listener-earnings", billingController.getListenerEarningsDashboard);

module.exports = router;
