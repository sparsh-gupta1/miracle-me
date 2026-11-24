const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const { msg91 } = require("../config");
const logger = require("./logger");

const msg91Client = axios.create({
    baseURL: msg91.baseUrl,
    timeout: 10000,
});

axiosRetry(msg91Client, {
    retries: 2,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status >= 500;
    },
    onRetry: (retryCount, error) => {
        logger.warn(`Retrying MSG91 API call (${retryCount}/2)... Error: ${error.message}`);
    }
});

module.exports = msg91Client;
