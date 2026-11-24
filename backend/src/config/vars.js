require("dotenv").config();

module.exports = {
    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        expiry: process.env.JWT_EXPIRES_IN || "1d",
        refreshExpiry: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
    },
    webSocketOrigin: process.env.ALLOWED_ORIGINS || "*",
    redis_host: process.env.REDIS_HOST || "127.0.0.1",
    redis_port: process.env.REDIS_PORT || 6379,
    redis_password: process.env.REDIS_PASSWORD || "",
    messageCentral: {
        authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN,
        customerId: process.env.MESSAGECENTRAL_CUSTOMER_ID,
        baseUrl: process.env.MESSAGECENTRAL_BASE_URL || "https://cpaas.messagecentral.com",
        apiKey: process.env.MESSAGECENTRAL_API_KEY,
    },
    sms: {
        enable: process.env.ENABLE_SMS !== 'false',
    },
    msg91: {
        authKey: process.env.MSG91_AUTH_KEY,
        templateId: process.env.MSG91_TEMPLATE_ID,
        baseUrl: process.env.MSG91_BASE_URL || "https://control.msg91.com/api/v5",
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    },
};
