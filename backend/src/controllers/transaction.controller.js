const transactionService = require("../services/transaction.service");
const paymentService = require("../services/payment.service");
const withdrawalService = require("../services/withdrawal.service");
const logger = require("../utils/logger");
const { randomUUID } = require("crypto");

/**
 * Initialize a new transaction and create a Razorpay order
 */
const createTransaction = async (req, res, next) => {
  try {
    const { amount, currency, description } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    const userId = req.user.id;
    const GST_RATE = 18;

    // 0. adding a gst
    const GST_Amount = (amount * GST_RATE) / 100;
    const Final_Amount = amount + GST_Amount;

    // 1. Create Razorpay order
    const orderId = `order_${Date.now()}_${userId.slice(0, 8)}`;
    const order = await paymentService.createOrder(
      Final_Amount,
      currency,
      orderId,
      {
        id: userId,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.mobileNumber,
        note: description,
      },
    );

    // 2. Persist transaction in our DB
    const transaction = await transactionService.createTransaction({
      userId,
      amount,
      currency: currency || "INR",
      provider: "razorpay",
      providerOrderId: order.order_id,
      description,
      status: "pending",
      metadata: {
        providerAmount: Final_Amount,
        providerOrderId: order.cf_order_id,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        transaction,
        order: {
          orderId: order.order_id,
          cfOrderId: order.cf_order_id,
          paymentSessionId: order.payment_session_id,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get transactions for the authenticated user
 */
const getMyTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const transactions = await transactionService.getUserTransactions(userId);
    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify a payment by asking Razorpay for the authoritative order status.
 */
const verifyPayment = async (req, res, next) => {
  try {
    const orderId = req.body.order_id || req.body.orderId;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "order_id is required" });
    }

    // 1. Find transaction
    const transaction = await transactionService.getTransactionByProviderOrderId(
      orderId
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found for this order",
      });
    }

    const order = await paymentService.getOrder(transaction.metadata.providerOrderId);
    if (order.order_status !== "PAID") {
      return res.status(400).json({
        success: false,
        message: `Payment is not complete: ${order.order_status}`,
      });
    }

    const expectedAmount = Number(transaction.metadata?.providerAmount);
    if (Number(order.order_amount) !== expectedAmount) {
      return res.status(400).json({ success: false, message: "Payment amount mismatch" });
    }

    // 2. Update status to completed (this also credits the wallet)
    const updatedTransaction = await transactionService.updateTransactionStatus(
      transaction.id,
      "completed",
      {
        metadata: { ...transaction.metadata, verification: order },
      }
    );

    res.status(200).json({
      success: true,
      message: "Payment verified and wallet updated successfully",
      data: updatedTransaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Razorpay webhooks.
 */
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const timestamp = req.headers["x-webhook-timestamp"]; // Not used by Razorpay
    const event = req.body;

    const isValid = paymentService.verifyWebhook(signature, timestamp, req.rawBody);
    if (!isValid) {
      logger.warn(
        `Razorpay webhook signature rejected (signature: ${Boolean(signature)}, rawBodyLength: ${req.rawBody?.length || 0})`,
      );
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const eventName = event.event; // Razorpay uses 'event'
    const payload = event.payload || {};
    const paymentEntity = payload.payment?.entity;
    const orderEntity = payload.order?.entity;
    const refundEntity = payload.refund?.entity;

    const orderId =
      orderEntity?.id || paymentEntity?.order_id || refundEntity?.order_id || event.order_id;
    const paymentId = paymentEntity?.id;
    logger.info(`Processing Razorpay webhook event: ${eventName}`);

    if (orderId) {
      const transaction =
        await transactionService.getTransactionByProviderOrderId(orderId);
      if (transaction && (eventName === "payment.captured" || eventName === "order.paid")) {
        await transactionService.updateTransactionStatus(
          transaction.id,
          "completed",
          {
            providerPaymentId: paymentId || transaction.providerPaymentId,
            providerSignature: signature,
            metadata: { ...transaction.metadata, webhook: event },
          },
        );
      } else if (transaction && eventName === "payment.failed") {
        await transactionService.updateTransactionStatus(
          transaction.id,
          "failed",
          { providerPaymentId: paymentId, metadata: { ...transaction.metadata, webhook: event } },
        );
      } else if (
        transaction &&
        eventName === "refund.processed" &&
        refundEntity?.status === "processed"
      ) {
        await transactionService.refundTransaction(transaction.id, event);
      }
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    logger.error("Webhook processing error:", error);
    next(error);
  }
};

/**
 * Initiate a refund for a transaction
 */
const initiateRefund = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { amount, notes } = req.body;

    const transaction =
      await transactionService.getTransactionByPk(transactionId);
    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    if (transaction.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Only completed transactions can be refunded",
      });
    }

    if (!transaction.providerOrderId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing provider order ID" });
    }

    const refundId = `refund_${randomUUID()}`;
    const refund = await paymentService.initiateRefund(
      transaction.providerOrderId,
      amount || transaction.metadata?.providerAmount || transaction.amount,
      refundId,
      typeof notes === "string" ? notes : JSON.stringify(notes || {}),
    );

    // Update local DB
    if (refund.refund_status === "SUCCESS") {
      await transactionService.refundTransaction(transaction.id, refund);
    }

    res.status(200).json({
      success: true,
      data: refund,
    });
  } catch (error) {
    next(error);
  }
};

// get all transactions - admin only (not implemented here)

const getAllTransactions = async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    order = "DESC",
    search = "",
  } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 10, 100);
  try {
    const transactions = await transactionService.getAllTransactions(
      page,
      safeLimit,
      sortBy,
      order,
      search
    );
    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle withdrawal (redeem) request
 */
const createWithdrawalRequest = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    const request = await withdrawalService.createWithdrawalRequest(userId, amount);

    res.status(201).json({
      success: true,
      data: request,
      message: "Withdrawal request submitted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recharge records for the authenticated user
 */
const getRechargeRecords = async (req, res, next) => {
  try {
    const walletService = require("../services/wallet.service");
    const userId = req.user.id;
    const { page = 1, limit = 20, walletType = "main" } = req.query;

    const result = await walletService.getWalletTransactions(
      userId,
      { referenceType: "recharge", walletType },
      { page: parseInt(page), limit: Math.min(parseInt(limit) || 20, 100) }
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get detailed wallet history for the authenticated user
 */
const getWalletHistory = async (req, res, next) => {
  try {
    const walletService = require("../services/wallet.service");
    const userId = req.user.id;
    const userRole = req.user.role;
    const { page = 1, limit = 20, type, referenceType } = req.query;

    // Listeners and astrologers see both wallets by default (unless explicitly filtered)
    const isPractitioner = userRole === "listener" || userRole === "astrologer";
    const walletType = req.query.walletType || (isPractitioner ? "all" : "main");

    const result = await walletService.getWalletHistoryWithDetails(
      userId,
      { type, referenceType, walletType },
      { page: parseInt(page), limit: Math.min(parseInt(limit) || 20, 100) }
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTransaction,
  getMyTransactions,
  verifyPayment,
  handleWebhook,
  initiateRefund,
  getAllTransactions,
  createWithdrawalRequest,
  getRechargeRecords,
  getWalletHistory,
};
