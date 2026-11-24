const bankInfoService = require("../services/bankInfo.service");

/**
 * Astrologer / Listener: Submit or update bank info
 */
const submitBankInfo = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const data = req.body;

        const bankInfo = await bankInfoService.upsertBankInfo(userId, data);

        res.status(200).json({
            success: true,
            message: "Bank information saved successfully",
            data: bankInfo,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Astrologer / Listener: Get own bank info
 */
const getMyBankInfo = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const bankInfo = await bankInfoService.getBankInfo(userId);

        if (!bankInfo) {
            return res.status(404).json({
                success: false,
                message: "Bank information not found. Please submit your details.",
            });
        }

        // Mask account number for self view (e.g. XXXX1234)
        const bankInfoJson = bankInfo.toJSON();
        if (bankInfoJson.accountNumber && bankInfoJson.accountNumber.length > 4) {
             const visibleDigits = bankInfoJson.accountNumber.slice(-4);
             const maskedSection = 'X'.repeat(Math.max(4, bankInfoJson.accountNumber.length - 4));
             bankInfoJson.accountNumber = maskedSection + visibleDigits;
        }

        res.status(200).json({
            success: true,
            data: bankInfoJson,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: Get all bank infos with filters
 */
const getAllBankInfos = async (req, res, next) => {
    try {
        const { role, isVerified, page = 1, limit = 20 } = req.query;

        const result = await bankInfoService.getAllBankInfos(
            { role, isVerified },
            { page: parseInt(page), limit: parseInt(limit) }
        );

        // Mask account numbers in list view
        result.data = result.data.map(info => {
            const infoJson = info.toJSON();
            if (infoJson.accountNumber && infoJson.accountNumber.length > 4) {
                 const visibleDigits = infoJson.accountNumber.slice(-4);
                 const maskedSection = 'X'.repeat(Math.max(4, infoJson.accountNumber.length - 4));
                 infoJson.accountNumber = maskedSection + visibleDigits;
            }
            return infoJson;
        });

        res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: Get specific user's bank info (fully decrypted)
 */
const getUserBankInfo = async (req, res, next) => {
    try {
        const { userId } = req.params;

        const bankInfo = await bankInfoService.getBankInfo(userId);

        if (!bankInfo) {
            return res.status(404).json({
                success: false,
                message: "Bank information not found for this user",
            });
        }

        // Admin sees the full account number here (already decrypted by getter)
        res.status(200).json({
            success: true,
            data: bankInfo,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Admin: Verify a user's bank info
 */
const verifyBankInfo = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const adminId = req.user.id;

        const bankInfo = await bankInfoService.verifyBankInfo(userId, adminId);

        res.status(200).json({
            success: true,
            message: "Bank information verified successfully",
            data: bankInfo,
        });
    } catch (error) {
        if (error.message === "Bank info not found for this user" || 
            error.message === "Bank info is already verified") {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        next(error);
    }
};

module.exports = {
    submitBankInfo,
    getMyBankInfo,
    getAllBankInfos,
    getUserBankInfo,
    verifyBankInfo,
};
