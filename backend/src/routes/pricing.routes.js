const express = require("express");
const router = express.Router();
const pricingController = require("../controllers/pricing.controller");
const {
    authenticate,
    requireAdmin,
    requireRoles,
} = require("../middlewares/auth.middleware");
const { validate } = require("../middlewares/validation.middleware");


const {
    createListenerPricingSchema,
    updateListenerPricingSchema,
    createAstrologerPricingSchema,
    updateAstrologerPricingSchema,
    createListenerCustomPricingSchema,
    updateListenerCustomPricingSchema,
} = require("../utils/validation-schemas");

router.use(authenticate);

// ========== EFFECTIVE PRICING (Authenticated users) ==========
router.get(
    "/effective/:astrologerId/:serviceType",
    pricingController.getEffectivePricing
);
router.get(
    "/my-current-pricing",
    pricingController.getMyCurrentPricing
);

// ========== ADMIN ROUTES - LISTENER GLOBAL PRICING ==========
router.post(
    "/listener",
    requireAdmin,
    validate(createListenerPricingSchema),
    pricingController.createListenerPricing
);

router.put(
    "/listener/:pricingId",
    requireAdmin,
    validate(updateListenerPricingSchema),
    pricingController.updateListenerPricing
);

router.get(
    "/listener",
    requireAdmin,
    pricingController.getAllListenerPricing
);

router.get(
    "/listener/:serviceType/history",
    requireAdmin,
    pricingController.getListenerPricingHistory
);

// ========== ADMIN ROUTES - LISTENER CUSTOM PRICING (per listener) ==========
router.post(
    "/listener-custom/:listenerId",
    requireAdmin,
    validate(createListenerCustomPricingSchema),
    pricingController.adminSetListenerPricing
);

router.get(
    "/listener-custom/:listenerId",
    requireAdmin,
    pricingController.getListenerPricingByAdmin
);

router.put(
    "/listener-custom/:listenerId/:serviceType",
    requireAdmin,
    validate(updateListenerCustomPricingSchema),
    pricingController.adminUpdateListenerPricing
);

router.delete(
    "/listener-custom/:listenerId/:serviceType",
    requireAdmin,
    pricingController.adminDeleteListenerPricing
);

// ========== ASTROLOGER (self) - READ ONLY ==========
// Keep "/astrologer/my" registered BEFORE "/astrologer/:astrologerId"
// so the literal "my" is not captured as an astrologerId param.
router.get(
    "/astrologer/my",
    requireRoles(["astrologer"]),
    pricingController.getMyPricing
);

// ========== ADMIN ROUTES - ASTROLOGER CUSTOM PRICING (per service) ==========
router.post(
    "/astrologer/:astrologerId",
    requireAdmin,
    validate(createAstrologerPricingSchema),
    pricingController.adminSetAstrologerPricing
);

router.get(
    "/astrologer/:astrologerId",
    requireAdmin,
    pricingController.getAstrologerPricingByAdmin
);

router.put(
    "/astrologer/:astrologerId/:serviceType",
    requireAdmin,
    validate(updateAstrologerPricingSchema),
    pricingController.adminUpdateAstrologerPricing
);

router.delete(
    "/astrologer/:astrologerId/:serviceType",
    requireAdmin,
    pricingController.adminDeleteAstrologerPricing
);

module.exports = router;
