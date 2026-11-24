const dashboardService = require("../services/dashboard.service");

// ========== ADMIN - DASHBOARD ==========

const respond = (serviceFn) => async (req, res, next) => {
    try {
        const data = await serviceFn(req.validatedQuery || {});
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getOverview: respond(dashboardService.getOverview),
    getTrend: respond(dashboardService.getTrend),
    getSessionBreakdown: respond(dashboardService.getSessionBreakdown),
    getRequestFunnel: respond(dashboardService.getRequestFunnel),
    getTopPractitioners: respond(dashboardService.getTopPractitioners),
    getFinance: respond(dashboardService.getFinance),
};
