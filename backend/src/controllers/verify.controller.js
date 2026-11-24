const verifyService = require("../services/verify.service");
const logger = require("../utils/logger");

/**
 * Sends OTP via Message Central
 * @param {Object} req 
 * @param {Object} res 
 * @param {Function} next 
 */
exports.sendOtp = async (req, res, next) => {
    try {
        const { mobileNumber, countryCode } = req.body;
        const result = await verifyService.sendOtp(mobileNumber, countryCode);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

/**
 * Validates OTP via Message Central
 * @param {Object} req 
 * @param {Object} res 
 * @param {Function} next 
 */
exports.validateOtp = async (req, res, next) => {
    try {
        const { verificationId, code } = req.body;
        const result = await verifyService.validateOtp(verificationId, code);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};
