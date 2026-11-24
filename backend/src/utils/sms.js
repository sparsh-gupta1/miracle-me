const config = require("../config");
const logger = require("./logger");

/**
 * Send OTP via MessageCentral
 * @param {string} mobileNumber - 10 digit mobile number
 * @param {string} countryCode - Country code without + (default 91)
 * @returns {Promise<Object>} - API response
 */
exports.sendOTP = async (mobileNumber, countryCode = "91") => {
    const { authToken, customerId, baseUrl } = config.messageCentral;
    const url = `${baseUrl}/verification/v3/send?countryCode=${countryCode}&customerId=${customerId}&flowType=SMS&mobileNumber=${mobileNumber}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                authToken: authToken,
            },
        });

        let data;
        try {
            const text = await response.text();
            if (!text) {
                throw new Error("Empty response from SMS provider");
            }
            data = JSON.parse(text);
        } catch (parseError) {
            throw new Error("Invalid response from SMS provider");
        }

        logger.info(`SMS OTP request for ${mobileNumber}: `, data);

        if (data.responseCode !== 200 && data.message !== "REQUEST_ALREADY_EXISTS") {
            throw new Error(data.message || "Failed to send OTP via SMS provider");
        }

        return data;
    } catch (error) {
        logger.error(`Error sending SMS to ${mobileNumber}:`, error);
        throw error;
    }
};

/**
 * Verify OTP via MessageCentral
 * @param {string} mobileNumber - 10 digit mobile number
 * @param {string} countryCode - Country code without + (default 91)
 * @param {string} otp - OTP to verify
 * @returns {Promise<boolean>} - True if verified
 */
exports.verifyOTP = async (mobileNumber, countryCode = "91", otp) => {
    const { authToken, customerId, baseUrl } = config.messageCentral;
    const url = `${baseUrl}/verification/v3/validate?countryCode=${countryCode}&customerId=${customerId}&mobileNumber=${mobileNumber}&verificationCode=${otp}`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                authToken: authToken,
            },
        });

        let data;
        try {
            const text = await response.text();
            if (!text) return false;
            data = JSON.parse(text);
        } catch (parseError) {
            return false;
        }

        logger.info(`SMS OTP verification for ${mobileNumber}: `, data);

        // MessageCentral returns 200 for successful validation
        return data.responseCode === 200 && data.data && data.data.verificationStatus === "VERIFIED";
    } catch (error) {
        logger.error(`Error verifying SMS OTP for ${mobileNumber}:`, error);
        return false;
    }
};
