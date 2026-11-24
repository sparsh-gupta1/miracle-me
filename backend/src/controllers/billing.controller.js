const BillingService = require("../services/billing.service");

exports.getUsageDashboard = async (req, res, next) => {
    const { id } = req.user;
    try {
        const usage = await BillingService.getUsageDashboard(id);
        res.json({ success: true, data: usage });
    } catch (error) {
        next(error);
    }
};

exports.getListenerEarningsDashboard = async (req, res, next) => {
    const { id } = req.user;
    try {
        const earnings = await BillingService.getListenerEarningsDashboard(id);
        res.json({ success: true, data: earnings });
    } catch (error) {
        next(error);
    }
};
