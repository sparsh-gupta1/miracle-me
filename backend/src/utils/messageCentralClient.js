const axios = require("axios");
const axiosRetry = require("axios-retry").default;
const { messageCentral } = require("../config");
const logger = require("./logger");

const messageCentralClient = axios.create({
    baseURL: messageCentral.baseUrl,
    timeout: 10000,
});

axiosRetry(messageCentralClient, {
    retries: 2,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status >= 500;
    },
    onRetry: (retryCount, error) => {
        logger.warn(`Retrying Message Central API call (${retryCount}/2)... Error: ${error.message}`);
    }
});

module.exports = messageCentralClient;
