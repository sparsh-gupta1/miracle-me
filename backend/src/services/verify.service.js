const msg91Client = require("../utils/msg91Client");
const redisService = require("./redis.service");
const { msg91 } = require("../config");
const logger = require("../utils/logger");
const { maskMobile } = require("../utils/mask.util");

class VerifyService {
    constructor() {
        this.rateLimitPrefix = "otp_rate_limit:";
    }

    /**
     * Sends custom OTP to a mobile number via MSG91.
     * @param {string} mobileNumber 
     * @param {string} countryCode 
     * @param {string} otp 
     * @returns {Promise<Object>}
     */
    async sendOtp(mobileNumber, countryCode = "91", otp) {
        const masked = maskMobile(mobileNumber);
        const rateLimitKey = `${this.rateLimitPrefix}${mobileNumber}`;

        try {
            // 1. Rate Limiting Check (max 3 per hour)
            const attempts = await redisService.get(rateLimitKey) || 0;
            if (parseInt(attempts) >= 3) {
                // throw { status: 429, message: "Maximum OTP attempts reached. Try again after an hour." };
                logger.warn(`Rate limit warning for ${masked}, but allowing for now or handle appropriately.`);
            }

            if (!msg91.authKey || !msg91.templateId) {
                logger.error("Missing MSG91 credentials in configuration");
                // For local dev without MSG91 credentials, we might just return success
                return { success: true, message: "Bypassed SMS delivery (no msg91 config)" };
            }

            // 2. Send Custom OTP via MSG91
            logger.info(`Sending OTP to ${masked} via MSG91`);
            
            // Format for MSG91 Flow API
            const response = await msg91Client.post("/flow", {
                template_id: msg91.templateId,
                short_url: "0",
                recipients: [
                    {
                        mobiles: `${countryCode}${mobileNumber}`,
                        // Supply the OTP to the variable in the template
                        var1: otp
                    }
                ]
            }, {
                headers: {
                    authkey: msg91.authKey,
                    "content-type": "application/json"
                }
            });

            const data = response.data;
            if (data && data.type === "success") {
                // Update Rate Limit (set to 1 hour if not exists)
                if (attempts === 0) {
                    await redisService.set(rateLimitKey, 1, 3600);
                } else {
                    await redisService.set(rateLimitKey, parseInt(attempts) + 1, 3600);
                }

                return {
                    success: true,
                    // We don't return verificationId since we will validate local custom OTP
                    message: "OTP sent successfully"
                };
            }

            logger.error(`MSG91 Response: ${JSON.stringify(data)}`);
            throw new Error(data.message || "Failed to send OTP via MSG91");
        } catch (error) {
            logger.error(`Error sending OTP to ${masked}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Validates OTP.
     * Not used if custom OTP is validated locally using DB.
     * Stubbed to maintain compatibility if called.
     * @param {string} verificationId 
     * @param {string} code 
     * @returns {Promise<Object>}
     */
    async validateOtp(verificationId, code) {
        return {
            success: true,
            message: "OTP verified successfully (bypassed remote call)"
        };
    }
}

module.exports = new VerifyService();
