const pricingService = require("../services/pricing.service");

// ========== ADMIN - LISTENER GLOBAL PRICING ==========

/**
 * Create new listener global pricing
 */
const createListenerPricing = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const { serviceType, pricePerMinute, effectiveFrom } = req.body;

        const pricing = await pricingService.createListenerGlobalPricing(
            { serviceType, pricePerMinute, effectiveFrom },
            adminId
        );

        res.status(201).json({
            success: true,
            message: "Listener pricing created successfully",
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update listener global pricing
 */
const updateListenerPricing = async (req, res, next) => {
    try {
        const { pricingId } = req.params;
        const { pricePerMinute, isActive } = req.body;

        const pricing = await pricingService.updateListenerGlobalPricing(
            pricingId,
            { pricePerMinute, isActive }
        );

        res.status(200).json({
            success: true,
            message: "Listener pricing updated successfully",
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get listener pricing history for a service type
 */
const getListenerPricingHistory = async (req, res, next) => {
    try {
        const { serviceType } = req.params;

        const history = await pricingService.getListenerPricingHistory(serviceType);

        res.status(200).json({
            success: true,
            data: history,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get comprehensive overview of listener pricing (current, upcoming, and history)
 */
const getAllListenerPricing = async (req, res, next) => {
    try {
        const pricingOverview = await pricingService.getListenerPricingOverview();

        res.status(200).json({
            success: true,
            data: pricingOverview,
        });
    } catch (error) {
        next(error);
    }
};

// ========== ADMIN - LISTENER CUSTOM PRICING ==========

/**
 * Admin: set (create/upsert) a listener's custom pricing for a service
 */
const adminSetListenerPricing = async (req, res, next) => {
    try {
        const { listenerId } = req.params;
        const { serviceType, pricePerMinute } = req.body;

        const pricing = await pricingService.createListenerCustomPricing(listenerId, {
            serviceType,
            pricePerMinute,
        });

        res.status(201).json({
            success: true,
            message: "Listener pricing saved successfully",
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: update a listener's custom pricing for a service
 */
const adminUpdateListenerPricing = async (req, res, next) => {
    try {
        const { listenerId, serviceType } = req.params;
        const { pricePerMinute, isActive } = req.body;

        const pricing = await pricingService.updateListenerCustomPricing(
            listenerId,
            serviceType,
            { pricePerMinute, isActive }
        );

        res.status(200).json({
            success: true,
            message: "Listener pricing updated successfully",
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: delete a listener's custom pricing for a service (reverts to global)
 */
const adminDeleteListenerPricing = async (req, res, next) => {
    try {
        const { listenerId, serviceType } = req.params;

        const deleted = await pricingService.deleteListenerCustomPricing(
            listenerId,
            serviceType
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: `Custom pricing for ${serviceType} not found`,
            });
        }

        res.status(200).json({
            success: true,
            message: "Listener custom pricing deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: get a specific listener's custom pricing
 */
const getListenerPricingByAdmin = async (req, res, next) => {
    try {
        const { listenerId } = req.params;

        const pricing = await pricingService.getListenerCustomPricing(listenerId);

        res.status(200).json({
            success: true,
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

// ========== ADMIN - ASTROLOGER CUSTOM PRICING ==========

/**
 * Admin: set (create/upsert) an astrologer's custom pricing for a service
 */
const adminSetAstrologerPricing = async (req, res, next) => {
    try {
        const { astrologerId } = req.params;
        const { serviceType, pricePerMinute } = req.body;

        const pricing = await pricingService.createAstrologerPricing(astrologerId, {
            serviceType,
            pricePerMinute,
        });

        res.status(201).json({
            success: true,
            message: "Astrologer pricing saved successfully",
            data: pricing,
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Admin: update an astrologer's custom pricing for a service
 */
const adminUpdateAstrologerPricing = async (req, res, next) => {
    try {
        const { astrologerId, serviceType } = req.params;
        const { pricePerMinute, isActive } = req.body;

        const pricing = await pricingService.updateAstrologerPricing(
            astrologerId,
            serviceType,
            { pricePerMinute, isActive }
        );

        res.status(200).json({
            success: true,
            message: "Astrologer pricing updated successfully",
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: delete an astrologer's custom pricing for a service
 */
const adminDeleteAstrologerPricing = async (req, res, next) => {
    try {
        const { astrologerId, serviceType } = req.params;

        const deleted = await pricingService.deleteAstrologerPricing(
            astrologerId,
            serviceType
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: `Pricing for ${serviceType} not found`,
            });
        }

        res.status(200).json({
            success: true,
            message: "Astrologer pricing deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: get a specific astrologer's custom pricing
 */
const getAstrologerPricingByAdmin = async (req, res, next) => {
    try {
        const { astrologerId } = req.params;

        const pricing = await pricingService.getAstrologerPricing(astrologerId);

        res.status(200).json({
            success: true,
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get my (astrologer's) custom pricing
 */
const getMyPricing = async (req, res, next) => {
    try {
        const astrologerId = req.user.id;

        const pricing = await pricingService.getAstrologerPricing(astrologerId);

        res.status(200).json({
            success: true,
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

// ========== EFFECTIVE PRICING ==========

/**
 * Get effective pricing for billing/UI
 */
const getEffectivePricing = async (req, res, next) => {
    try {
        const { astrologerId, serviceType } = req.params;

        const pricing = await pricingService.getEffectivePricing(
            astrologerId,
            serviceType
        );

        res.status(200).json({
            success: true,
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get current effective pricing for the logged-in user
 */
const getMyCurrentPricing = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        const pricing = await pricingService.getMyCurrentPricing(userId, role);

        res.status(200).json({
            success: true,
            data: pricing,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    // Listener Global Pricing (Admin)
    createListenerPricing,
    updateListenerPricing,
    getListenerPricingHistory,
    getAllListenerPricing,
    // Listener Custom Pricing (Admin-managed)
    adminSetListenerPricing,
    adminUpdateListenerPricing,
    adminDeleteListenerPricing,
    getListenerPricingByAdmin,
    // Astrologer Custom Pricing (Admin-managed)
    adminSetAstrologerPricing,
    adminUpdateAstrologerPricing,
    adminDeleteAstrologerPricing,
    getAstrologerPricingByAdmin,
    getMyPricing,
    // Effective Pricing
    getEffectivePricing,
    getMyCurrentPricing,
};
