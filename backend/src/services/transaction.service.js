const { Transaction, User, sequelize } = require("../models");
const { Op } = require("sequelize");
const walletService = require("./wallet.service");
const logger = require("../utils/logger");

/**
 * Create a new transaction
 * @param {Object} transactionData - Data for the transaction
 * @returns {Promise<Transaction>} - Created transaction
 */
const createTransaction = async (transactionData) => {
  try {
    const transaction = await Transaction.create(transactionData);
    return transaction;
  } catch (error) {
    throw error;
  }
};

/**
 * Update transaction status
 * @param {string} transactionId - UUID of the transaction
 * @param {string} status - New status
 * @param {Object} additionalData - Extra data (paymentId, signature, etc.)
 * @returns {Promise<Transaction>} - Updated transaction
 */
const updateTransactionStatus = async (
  transactionId,
  status,
  additionalData = {}
) => {
  const t = await sequelize.transaction();

  try {
    const transaction = await Transaction.findByPk(transactionId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // If transaction is already completed, don't process again
    if (transaction.status === "completed" && status === "completed") {
      await t.rollback();
      return transaction;
    }

    const updateData = { status, ...additionalData };
    await transaction.update(updateData, { transaction: t });

    // Credit wallet if transaction is completed
    if (status === "completed") {
      await walletService.creditWallet(
        transaction.userId,
        transaction.amount,
        "recharge",
        transaction.id,
        `Wallet recharge via ${transaction.provider || "payment gateway"}${transaction.description ? `: ${transaction.description}` : ""}`,
        {}, // metadata
        t   // externalTransaction — keeps wallet credit in the same DB transaction
      );
    }

    await t.commit();
    return transaction;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

/**
 * Get transaction by ID
 * @param {string} id
 * @returns {Promise<Transaction>}
 */
const getTransactionByPk = async (id) => {
  return await Transaction.findByPk(id);
};

/**
 * Get transaction by payment-provider order ID
 * @param {string} providerOrderId
 * @returns {Promise<Transaction>}
 */
const getTransactionByProviderOrderId = async (providerOrderId) => {
  try {
    const transaction = await Transaction.findOne({ where: { providerOrderId } });
    if (transaction) return transaction;
    
    // Fallback to Razorpay order ID stored in metadata
    return await Transaction.findOne({
      where: {
        "metadata.providerOrderId": providerOrderId
      }
    });
  } catch (error) {
    throw error;
  }
};

/**
 * List transactions for a user
 * @param {string} userId
 * @returns {Promise<Array<Transaction>>}
 */
const getUserTransactions = async (userId) => {
  try {
    return await Transaction.findAll({
      where: { userId },
      attributes: {
        exclude: [
          "metadata",
          "providerSignature",
          "providerPaymentId",
          "providerOrderId",
          "provider",
          "userId",
        ],
      },

      order: [["createdAt", "DESC"]],
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Mark a transaction as refunded
 * @param {string} transactionId
 * @param {Object} refundData - Data from the payment provider refund
 * @returns {Promise<Transaction>}
 */
const refundTransaction = async (transactionId, refundData = {}) => {
  try {
    const transaction = await Transaction.findByPk(transactionId);
    if (!transaction) throw new Error("Transaction not found");

    return await transaction.update({
      status: "refunded",
      metadata: { ...transaction.metadata, refundData },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get transaction by payment-provider payment ID
 * @param {string} providerPaymentId
 * @returns {Promise<Transaction>}
 */
const getTransactionByProviderPaymentId = async (providerPaymentId) => {
  return await Transaction.findOne({ where: { providerPaymentId } });
};

const getAllTransactions = async (
  page = 1,
  limit = 10,
  sortBy = "createdAt",
  order = "DESC",
  search = ""
) => {
  const offset = (page - 1) * limit;

  //   search by user mobile number or name or transaction status
  const whereClause = search
    ? {
      [Op.or]: [
        { "$user.mobileNumber$": { [Op.iLike]: `%${search}%` } },
        { "$user.name$": { [Op.iLike]: `%${search}%` } },
        { providerOrderId: { [Op.iLike]: `%${search}%` } },
      ],
    }
    : {};

  const { rows, count } = await Transaction.findAndCountAll({
    where: whereClause,
    attributes: {
      exclude: [
        "providerSignature",
        "providerPaymentId",
        "provider",
        "userId",
        "metadata", // 🔥 IMPORTANT
      ],
    },
    order: [[sortBy, order]],
    limit,
    offset,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "mobileNumber", "role"],
      },
    ],
  });

  const transactions = rows.map((row) => {
    const transaction = row.get({ plain: true });

    if (transaction.user && !transaction.user.name) {
      transaction.user.name = "Anonymous User";
    }

    try {
      const metadata =
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata;

      const entity = metadata?.payment?.entity;
      logger.debug("Transaction entity metadata:", entity);

      transaction.fee = entity?.fee ? entity.fee / 100 : 0;
      transaction.tax = entity?.tax ? entity.tax / 100 : 0;
    } catch (err) {
      transaction.fee = 0;
      transaction.tax = 0;
    }

    return transaction;
  });

  return {
    transactions,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
};

module.exports = {
  createTransaction,
  updateTransactionStatus,
  getTransactionByPk,
  getTransactionByProviderOrderId,
  getTransactionByProviderPaymentId,
  getUserTransactions,
  refundTransaction,
  getAllTransactions,
};
