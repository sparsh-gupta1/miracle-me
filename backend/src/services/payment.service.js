const razorpayInstance = require("../config/razorpay");
const crypto = require("crypto");
const { randomUUID } = crypto;
const { razorpay } = require("../config/vars");

/**
 * Create a new order
 * @param {number} amount - Amount in major currency units (e.g., rupees for INR)
 * @param {string} currency - Currency code (default: INR)
 * @param {string} orderId - Unique merchant order ID
 * @param {Object} customer - Customer details
 * @returns {Promise<Object>} - Order response matching Cashfree structure
 */
const createOrder = async (
    amount,
    currency = "INR",
    orderId,
    customer = {},
) => {
    try {
        if (!razorpayInstance) {
            throw new Error("Razorpay is not configured");
        }

        const merchantOrderId = orderId || `order_${Date.now()}_${randomUUID().slice(0, 8)}`;
        
        // Razorpay expects amount in smallest currency unit (paise for INR)
        const amountInPaise = Math.round(Number(amount) * 100);

        const options = {
            amount: amountInPaise,
            currency: currency,
            receipt: merchantOrderId,
            notes: {
                customer_id: customer.id || "unknown",
                customer_name: customer.name || "",
                customer_email: customer.email || "",
                customer_phone: customer.phone || "",
                order_note: customer.note || "",
            }
        };

        const razorpayOrder = await razorpayInstance.orders.create(options);

        // Map Razorpay response to match the existing Cashfree-like API contract
        return {
            order_id: merchantOrderId,
            cf_order_id: razorpayOrder.id, // Frontend can use this as Razorpay Order ID
            payment_session_id: razorpayOrder.id, // Dummy for contract preservation
            ...razorpayOrder
        };
    } catch (error) {
        const errorMsg = error.error ? error.error.description : error.message || "Razorpay payment error";
        const customError = new Error(errorMsg);
        customError.name = "ValidationError";
        throw customError;
    }
};

/**
 * Get the authoritative order status from Razorpay.
 */
const getOrder = async (orderId) => {
    try {
        if (!razorpayInstance) {
            throw new Error("Razorpay is not configured");
        }

        const razorpayOrder = await razorpayInstance.orders.fetch(orderId);
        
        // Map Razorpay status ('created', 'attempted', 'paid') to Cashfree status ('PAID', etc.)
        let mappedStatus = "PENDING";
        if (razorpayOrder.status === "paid") {
            mappedStatus = "PAID";
        } else if (razorpayOrder.status === "created" || razorpayOrder.status === "attempted") {
            mappedStatus = "ACTIVE";
        }

        return {
            ...razorpayOrder,
            order_status: mappedStatus,
            order_amount: razorpayOrder.amount / 100
        };
    } catch (error) {
        const errorMsg = error.error ? error.error.description : error.message || "Razorpay getOrder error";
        const customError = new Error(errorMsg);
        customError.name = "ValidationError";
        throw customError;
    }
};

/**
 * Verify Razorpay webhook signature.
 * @returns {boolean}
 */
const verifyWebhook = (signature, timestamp, rawBody) => {
    try {
        const webhookSecret = razorpay.webhookSecret;
        if (!signature || !rawBody || !webhookSecret) {
            return false;
        }

        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(rawBody)
            .digest("hex");
            
        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(signature)
        );
    } catch (error) {
        return false;
    }
};

/**
 * Initiate a refund via Razorpay.
 */
const initiateRefund = async (paymentId, amount, refundId, notes = "") => {
    try {
        if (!razorpayInstance) {
            throw new Error("Razorpay is not configured");
        }

        // amount is in major units, convert to paise if passed
        const amountInPaise = amount ? Math.round(Number(amount) * 100) : undefined;
        
        const refundData = {
            receipt: refundId,
            notes: { reason: notes }
        };
        if (amountInPaise) {
            refundData.amount = amountInPaise;
        }

        const response = await razorpayInstance.payments.refund(paymentId, refundData);
        return response;
    } catch (error) {
        const errorMsg = error.error ? error.error.description : error.message || "Razorpay refund error";
        const customError = new Error(errorMsg);
        customError.name = "ValidationError";
        throw customError;
    }
};

module.exports = {
    createOrder,
    getOrder,
    verifyWebhook,
    initiateRefund,
};
