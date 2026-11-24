const expertService = require("../services/expert.service");
const walletService = require("../services/wallet.service");
const crypto = require("crypto");

const wrap = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (error) {
    next(error);
  }
};

exports.listExperts = wrap((req) => expertService.listExperts(req.user.id, req.query));
exports.getExpert = wrap((req) => expertService.getExpert(req.user.id, req.params.id));
exports.getQuote = wrap((req) => expertService.getQuote(req.user.id, req.params.id, req.query.service));
exports.getSessions = wrap((req) => expertService.getSessions(req.user.id));
exports.getWallet = wrap((req) => expertService.getWallet(req.user.id));

// Demo-only stand-in for the payment gateway (Cashfree is not configured locally).
exports.demoTopup = async (req, res, next) => {
  if (process.env.DEMO_MODE !== "true") return res.status(404).json({ success: false, message: "Not found" });
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      return res.status(400).json({ success: false, message: "amount must be between 1 and 10000" });
    }
    await walletService.creditWallet(req.user.id, amount, "recharge", crypto.randomUUID(), "Demo top-up", { demo: true });
    res.json({ success: true, data: await expertService.getWallet(req.user.id) });
  } catch (error) {
    next(error);
  }
};
