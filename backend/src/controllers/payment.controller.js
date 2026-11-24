const paymentService = require("../services/payment.service");

const createOrder = async (req, res, next) => {
    try {
        const { amount, currency, receipt } = req.body;
        const order = await paymentService.createOrder(amount, currency, receipt, {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            phone: req.user.mobileNumber,
        });
        res.status(200).json({
            success: true,
            data: {
                orderId: order.order_id,
                cfOrderId: order.cf_order_id,
                paymentSessionId: order.payment_session_id,
            },
        });
    } catch (error) {
        next(error);
    }
};

const verifyPayment = async (req, res, next) => {
    try {
    const orderId = req.body.order_id || req.body.orderId;
    if (!orderId) {
        return res.status(400).json({ success: false, message: "order_id is required" });
    }

        const order = await paymentService.getOrder(orderId);
        const isValid = order.order_status === "PAID";

        if (isValid) {
            res.status(200).json({
                success: true,
                message: "Payment status verified successfully",
                data: order,
            });
        } else {
            res.status(400).json({
                success: false,
                message: "Invalid signature",
            });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createOrder,
    verifyPayment,
};
