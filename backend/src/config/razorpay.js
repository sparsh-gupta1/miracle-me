const Razorpay = require("razorpay");
const { razorpay } = require("./vars");

let instance = null;

if (razorpay.keyId && razorpay.keySecret) {
    instance = new Razorpay({
        key_id: razorpay.keyId,
        key_secret: razorpay.keySecret,
    });
} else {
    console.warn("Razorpay credentials not found in environment variables. Razorpay integration will not work.");
}

module.exports = instance;
