const commissionService = require("../services/commission.service");

// ========== ADMIN - COMMISSION MANAGEMENT ==========

/**
 * Create new commission rule
 */
const createCommissionRule = async (req, res, next) => {
    try {
        const adminId = req.user.id;
        const { role, serviceType, commissionPercentage, effectiveFrom } = req.body;

        const commission = await commissionService.createCommissionRule(
            { role, serviceType, commissionPercentage, effectiveFrom },
            adminId
        );

        res.status(201).json({
            success: true,
            message: "Commission rule created successfully",
            data: commission,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update commission rule
 */
const updateCommissionRule = async (req, res, next) => {
    try {
        const { ruleId } = req.params;
        const { commissionPercentage, isActive } = req.body;

        const commission = await commissionService.updateCommissionRule(
            ruleId,
            { commissionPercentage, isActive }
        );

        res.status(200).json({
            success: true,
            message: "Commission rule updated successfully",
            data: commission,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get commission rules with optional filters
 */
const getCommissionRules = async (req, res, next) => {
    try {
        const { role, serviceType } = req.query;

        const rules = await commissionService.getCommissionRules(role, serviceType);

        res.status(200).json({
            success: true,
            data: rules,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get current active commission for a specific role and service type
 */
const getCurrentCommission = async (req, res, next) => {
    try {
        const { role, serviceType } = req.params;

        const commission = await commissionService.getCurrentCommission(role, serviceType);

        if (!commission) {
            return res.status(404).json({
                success: false,
                message: `No active commission found for ${role} - ${serviceType}`,
            });
        }

        res.status(200).json({
            success: true,
            data: commission,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all current active commissions
 */
const getAllCurrentCommissions = async (req, res, next) => {
    try {
        const commissions = await commissionService.getAllCurrentCommissions();

        res.status(200).json({
            success: true,
            data: commissions,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Calculate commission for a given amount
 */
const calculateCommission = async (req, res, next) => {
    try {
        const { grossAmount, role, serviceType } = req.body;

        const calculation = await commissionService.calculateCommission(
            grossAmount,
            role,
            serviceType
        );

        res.status(200).json({
            success: true,
            data: calculation,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createCommissionRule,
    updateCommissionRule,
    getCommissionRules,
    getCurrentCommission,
    getAllCurrentCommissions,
    calculateCommission,
};
