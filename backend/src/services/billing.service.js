const {
  CommunicationCharge,
  DailyEarnings,
  Chat,
  User,
  Wallet,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");
const logger = require("../utils/logger");
const pricingService = require("./pricing.service");
const commissionService = require("./commission.service");
const walletService = require("./wallet.service");

class BillingService {
  /**
   * Calculate rate per second from price per minute
   * @param {number} pricePerMinute - Price per minute
   * @returns {number} - Rate per second
   */
  calculateRatePerSecond(pricePerMinute) {
    return Math.round((parseFloat(pricePerMinute) / 60) * 1000000) / 1000000;
  }

  /**
   * Calculate billing amounts
   * @param {string} serviceType - Service type
   * @param {number} durationSeconds - Duration in seconds
   * @param {object} pricingInfo - Pricing information
   * @param {string} userRole - User role for commission calculation
   * @returns {Promise<object>}
   */
  async calculateBillingAmount(
    serviceType,
    durationSeconds,
    pricingInfo,
    userRole,
  ) {
    try {
      const pricePerMinute = parseFloat(
        pricingInfo.pricePerMinute !== undefined
          ? pricingInfo.pricePerMinute
          : pricingInfo.price_per_minute,
      );
      const ratePerSecond = this.calculateRatePerSecond(pricePerMinute);
      const grossAmount = parseFloat(
        (durationSeconds * ratePerSecond).toFixed(2),
      );

      // Calculate commission
      const commissionData = await commissionService.calculateCommission(
        grossAmount,
        userRole,
        serviceType,
      );

      return {
        pricePerMinute,
        ratePerSecond,
        grossAmount,
        commissionPercentage: commissionData.commissionPercentage,
        commissionAmount: commissionData.commissionAmount,
        netEarning: commissionData.netEarning,
        pricingSource: pricingInfo.source,
        pricingId:
          pricingInfo.pricingId !== undefined
            ? pricingInfo.pricingId
            : pricingInfo.pricing_id,
      };
    } catch (error) {
      logger.error("Error calculating billing amount:", error);
      throw error;
    }
  }

  /**
   * Create communication charge record
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @param {object} billingData - Billing data
   * @param {object} transaction - Sequelize transaction
   * @returns {Promise<CommunicationCharge>}
   */
  async createCommunicationCharge(
    conversationId,
    userId,
    billingData,
    transaction,
  ) {
    try {
      // Extract billingSessionId from metadata if present
      const billingSessionId = billingData.metadata?.billingSessionId;

      // Check if exact same charge already exists
      if (!billingSessionId) {
        throw new Error(
          "billingSessionId is required in metadata for idempotent charge creation",
        );
      }

      const existingCharge = await CommunicationCharge.findOne({
        where: {
          conversationId,
          userId,
          metadata: { billingSessionId },
        },
        transaction,
      });

      if (existingCharge) {
        logger.info(
          `Communication charge already exists for session ${billingSessionId}. Skipping duplicate.`,
        );
        return existingCharge;
      }

      const charge = await CommunicationCharge.create(
        {
          conversationId,
          userId,
          serviceType: billingData.serviceType,
          durationSeconds: billingData.durationSeconds,
          pricePerMinute: billingData.pricePerMinute,
          ratePerSecond: billingData.ratePerSecond,
          grossAmount: billingData.grossAmount,
          commissionPercentage: billingData.commissionPercentage,
          commissionAmount: billingData.commissionAmount,
          netEarning: billingData.netEarning,
          pricingSource: billingData.pricingSource,
          pricingId: billingData.pricingId,
          walletTransactionId: billingData.walletTransactionId || null,
          chargedAt: new Date(),
          metadata: billingData.metadata || {},
        },
        { transaction },
      );

      logger.info(
        `Communication charge created for conversation ${conversationId}`,
      );
      return charge;
    } catch (error) {
      logger.error("Error creating communication charge:", error);
      throw error;
    }
  }

  /**
   * Process conversation billing (called when conversation ends)
   * @param {string} conversationId - Conversation ID
   * @param {string} explicitPayerId - Optional explicit payer ID (e.g. for peer-to-peer practitioner calls)
   * @param {object} externalTransaction - Optional external transaction
   * @returns {Promise<object>}
   */
  async processConversationBilling(
    conversationId,
    explicitPayerId = null,
    externalTransaction = null,
  ) {
    try {
      // 1. Move DB reads OUTSIDE of the transaction to reduce lock duration
      const conversation = await Chat.findByPk(conversationId, {
        include: [
          { model: User, as: "participant1", attributes: ["id", "role"] },
          { model: User, as: "participant2", attributes: ["id", "role"] },
        ],
        transaction: externalTransaction,
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      if (conversation.status !== "ended") {
        throw new Error("Conversation must be ended before billing");
      }

      if (!conversation.durationSeconds || conversation.durationSeconds === 0) {
        logger.info(
          `Conversation ${conversationId} has zero duration, skipping billing`,
        );
        return { message: "No billing required for zero duration" };
      }

      const serviceType = conversation.serviceType || "chat";

      const durationSeconds = conversation.durationSeconds;

      // Identify payer and earner
      let payerId = null;
      let earnerId = null;
      let earnerRole = null;

      // A participant with role "user" always pays; they can never be the earner. If a caller
      // passes a non-"user" payer while the other participant is a "user" (e.g. the listener
      // sent the first chat message), ignore it and resolve by role.
      const p1Role = conversation.participant1?.role;
      const p2Role = conversation.participant2?.role;
      const hasUserParticipant = p1Role === "user" || p2Role === "user";
      const explicitPayerRole =
        conversation.participant1Id === explicitPayerId ? p1Role : p2Role;
      const useExplicitPayer =
        explicitPayerId && !(hasUserParticipant && explicitPayerRole !== "user");

      if (explicitPayerId && !useExplicitPayer) {
        logger.warn(
          `Billing ${conversationId}: explicit payer ${explicitPayerId} (${explicitPayerRole}) ignored; ` +
            `participant with role "user" pays.`,
        );
      }

      if (useExplicitPayer) {
        payerId = explicitPayerId;
        earnerId =
          conversation.participant1Id === explicitPayerId
            ? conversation.participant2Id
            : conversation.participant1Id;

        const earner =
          conversation.participant1Id === earnerId
            ? conversation.participant1
            : conversation.participant2;
        earnerRole = earner?.role || "listener";
      } else {
        // Identify by roles
        const p1 = conversation.participant1;
        const p2 = conversation.participant2;

        if (
          p1.role === "user" &&
          (p2.role === "listener" || p2.role === "astrologer")
        ) {
          payerId = p1.id;
          earnerId = p2.id;
          earnerRole = p2.role;
        } else if (
          p2.role === "user" &&
          (p1.role === "listener" || p1.role === "astrologer")
        ) {
          payerId = p2.id;
          earnerId = p1.id;
          earnerRole = p1.role;
        } else {
          // Neither participant is a 'user' role — this is a peer-to-peer session
          // (listener↔listener, astrologer↔astrologer, etc.)
          // The payer MUST be passed explicitly via explicitPayerId.
          // Falling back to participant1Id is wrong (alphabetic UUID sort ≠ caller).
          if (!useExplicitPayer) {
              throw new Error(
                  `Cannot determine payer for peer-to-peer session ${conversationId}. ` +
                  `Both participants have role "${p1.role}" / "${p2.role}". ` +
                  `Pass explicitPayerId to processConversationBilling().`
              );
          }
          // Should never reach here if explicitPayerId was set (caught above), 
          // but guard just in case
          payerId = conversation.participant1Id;
          earnerId = conversation.participant2Id;
          earnerRole = p2.role || "listener";
        }
      }

      // Get pricing also outside main transaction
      const pricingInfo = await pricingService.getEffectivePricing(
        earnerId,
        serviceType,
      );
      const pricePerMinuteVal =
        pricingInfo.pricePerMinute !== undefined
          ? pricingInfo.pricePerMinute
          : pricingInfo.price_per_minute;
      if (!pricePerMinuteVal) {
        throw new Error(
          `No pricing configured for service type: ${serviceType}`,
        );
      }

      // 2. Start the transaction only for write operations
      const t = externalTransaction || (await sequelize.transaction());

      try {
        // The conversation lock serializes retries from callers that do not
        // already hold the lock in endConversation.
        const lockedConversation = await Chat.findByPk(conversationId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        const billingSessionId = `${conversationId}:${lockedConversation.endedAt.getTime()}`;
        const transactionMetadata = { billingSessionId };

        // Check idempotency before consuming free minutes. Otherwise a retry
        // can consume the allocation again before wallet idempotency runs.
        const existingCharge = await CommunicationCharge.findOne({
          where: {
            conversationId,
            userId: payerId,
            metadata: { billingSessionId },
          },
          transaction: t,
        });

        if (existingCharge) {
          if (!externalTransaction) await t.commit();
          return {
            charge: existingCharge,
            message: "Conversation billing already processed",
            freeMinutesUsed: existingCharge.metadata?.freeSecondsUsed || 0,
            remainingFreeSeconds:
              existingCharge.metadata?.remainingFreeSeconds || 0,
            billingData: null,
          };
        }

        // Import free minutes service
        const freeMinutesService = require("./freeMinutes.service");

        // Check and consume free minutes
        const freeMinutesResult = await freeMinutesService.consumeFreeMinutes(
          payerId,
          serviceType,
          durationSeconds,
          t,
        );

        const { consumedFreeSeconds, remainingFreeSeconds, billableSeconds } =
          freeMinutesResult;

        // User billing is based only on the paid portion. Provider earnings
        // are calculated separately below from the eligible duration.
        const billingData = await this.calculateBillingAmount(
          serviceType,
          billableSeconds,
          pricingInfo,
          earnerRole,
        );

        let actualBillingAmount = billingData.grossAmount;
        let actualBillableSeconds = billableSeconds;
        let wasCapped = false;

        // A fully free session has no user debit and does not require a
        // main-wallet row to exist.
        let payerWallet = null;
        if (actualBillingAmount > 0) {
          // DEFENSIVE: Check if payer has sufficient balance (within the transaction
          // with LOCK.UPDATE so the read is consistent with the upcoming debit).
          payerWallet = await Wallet.findOne({
            where: { userId: payerId, type: "main" },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (!payerWallet) {
            // Wallet was not created during registration/login (creation failure
            // is swallowed silently in those flows). Auto-create it now so that
            // billing can proceed — the zero balance will be caught by the
            // insufficient-balance cap logic below.
            logger.warn(
              `Wallet not found for payer ${payerId}. Auto-creating with zero balance.`,
            );
            const walletServiceModule = walletService;
            await walletServiceModule.createWallet(payerId, "main", t);
            payerWallet = await Wallet.findOne({
              where: { userId: payerId, type: "main" },
              transaction: t,
              lock: t.LOCK.UPDATE,
            });
            if (!payerWallet) {
              throw new Error(
                `Failed to create wallet for payer ${payerId}`,
              );
            }
          }
        }

        if (payerWallet && payerWallet.balance < billingData.grossAmount) {
          logger.warn(
            `Insufficient balance for full billing. ` +
              `Required: ${billingData.grossAmount}, Available: ${payerWallet.balance}. ` +
              `Capping charge at available balance.`,
          );

          // Cap at available balance
          actualBillingAmount = payerWallet.balance;
          wasCapped = true;

          // Recalculate billable seconds based on capped amount
          const pricePerMinuteVal =
            pricingInfo.pricePerMinute !== undefined
              ? pricingInfo.pricePerMinute
              : pricingInfo.price_per_minute;
          const ratePerSecond = pricePerMinuteVal / 60;
          actualBillableSeconds = Math.floor(
            actualBillingAmount / ratePerSecond,
          );

          // Recalculate billing data with capped amount
          const cappedBillingData = await this.calculateBillingAmount(
            serviceType,
            actualBillableSeconds,
            pricingInfo,
            earnerRole,
          );

          // Update billing data
          Object.assign(billingData, cappedBillingData);

          // Sync the actual amount to be debited with the recalculated gross amount
          // based on the cleanly floored billable seconds.
          actualBillingAmount = billingData.grossAmount;
        }

        // Provider earnings include the free portion and the paid portion
        // actually covered by the wallet. This preserves the existing cap
        // behavior when the wallet cannot cover the whole paid duration.
        const earningSeconds = consumedFreeSeconds + actualBillableSeconds;
        const earningBillingData = await this.calculateBillingAmount(
          serviceType,
          earningSeconds,
          pricingInfo,
          earnerRole,
        );

        // Wallet updates (now safe from insufficient balance errors)
        const payerWalletTransaction =
          actualBillingAmount > 0
            ? await walletService.debitWallet(
                payerId,
                actualBillingAmount,
                "conversation",
                conversationId, // Must be UUID
                wasCapped
                  ? `Payment for ${serviceType} conversation (${actualBillableSeconds}s billed, ${consumedFreeSeconds}s free) - CAPPED AT BALANCE`
                  : `Payment for ${serviceType} conversation (${billableSeconds}s billed, ${consumedFreeSeconds}s free)`,
                transactionMetadata,
                t,
                "main", // Debit from main wallet
              )
            : null;

        const earnerWalletTransaction = earningBillingData.netEarning > 0
          ? await walletService.creditWallet(
            earnerId,
            earningBillingData.netEarning,
            "conversation",
            conversationId, // Must be UUID
            `Earning from ${serviceType} conversation (${earningSeconds}s eligible)`,
            transactionMetadata,
            t,
            "earning" // Credit to earning wallet
          )
          : null;

        // Create communication charge record
        const charge = await this.createCommunicationCharge(
          conversationId,
          payerId, // The payer is the one being charged
          Object.assign({}, billingData, {
            serviceType, // Ensure serviceType is passed
            durationSeconds: billableSeconds, // Ensure billableSeconds is passed
            walletTransactionId: earnerWalletTransaction?.id || null, // Link to the earner's transaction
            metadata: {
              ...transactionMetadata, // Include billingSessionId
              totalDurationSeconds: durationSeconds, // Original total duration
              freeSecondsUsed: consumedFreeSeconds, // Free minutes used
              billableSeconds: billableSeconds, // Actual billable seconds
              earningSeconds,
              earningGrossAmount: earningBillingData.grossAmount,
              earningCommissionAmount: earningBillingData.commissionAmount,
              earningNetAmount: earningBillingData.netEarning,
              remainingFreeSeconds,
            },
          }),
          t,
        );

        // Atomic update for daily earnings
        await this.updateDailyEarnings(
          earnerId,
          earningBillingData.grossAmount,
          earningBillingData.commissionAmount,
          earningBillingData.netEarning,
          earningSeconds,
          t,
        );

        if (!externalTransaction) await t.commit();

        return {
          charge,
          payerTransaction: payerWalletTransaction,
          earnerTransaction: earnerWalletTransaction,
          earnerId,
          billingData,
          freeMinutesUsed: consumedFreeSeconds,
          remainingFreeSeconds,
        };
      } catch (error) {
        if (!externalTransaction) await t.rollback();
        throw error;
      }
    } catch (error) {
      logger.error("Error processing conversation billing:", error);
      throw error;
    }
  }

  /**
   * Update daily earnings summary
   * @param {string} userId - User ID
   * @param {number} grossAmount - Gross amount
   * @param {number} commissionAmount - Commission amount
   * @param {number} netEarning - Net earning
   * @param {number} durationSeconds - Duration in seconds
   * @param {object} transaction - Sequelize transaction
   * @returns {Promise<DailyEarnings>}
   */
  async updateDailyEarnings(
    userId,
    grossAmount,
    commissionAmount,
    netEarning,
    durationSeconds,
    transaction,
  ) {
    try {
      const dailyEarnings = await this._getOrCreateTodayRow(userId, transaction);

      // ATOMIC FIX: Use database-level increment to prevent race conditions
      // and floating-point errors during the addition
      await dailyEarnings.increment(
        {
          totalGross: parseFloat(grossAmount),
          totalCommission: parseFloat(commissionAmount),
          totalNet: parseFloat(netEarning),
          conversationCount: 1,
          totalDuration: durationSeconds,
        },
        { transaction },
      );

      return dailyEarnings;
    } catch (error) {
      logger.error(`Error updating daily earnings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Record a listener penalty against today's earnings summary so daily and
   * monthly totals stay net of penalties (matches the earning wallet).
   * @param {string} userId - Listener ID
   * @param {number} penaltyAmount - Amount debited from the earning wallet
   * @param {object} transaction - Sequelize transaction
   * @returns {Promise<DailyEarnings>}
   */
  async applyDailyPenalty(userId, penaltyAmount, transaction) {
    try {
      const amount = parseFloat(penaltyAmount);
      const dailyEarnings = await this._getOrCreateTodayRow(userId, transaction);

      await dailyEarnings.increment(
        { totalPenalty: amount, totalNet: -amount },
        { transaction },
      );

      return dailyEarnings;
    } catch (error) {
      logger.error(`Error applying daily penalty for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Today's date (YYYY-MM-DD) in the earnings timezone.
   * Use Asia/Kolkata (IST) for consistent daily grouping regardless of server
   * location. Override with the TIMEZONE environment variable.
   * @returns {string}
   */
  _earningsToday() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.TIMEZONE || "Asia/Kolkata",
    }).format(new Date());
  }

  async _getOrCreateTodayRow(userId, transaction) {
    const today = this._earningsToday();
    const [dailyEarnings] = await DailyEarnings.findOrCreate({
      where: { userId, date: today },
      defaults: {
        userId,
        date: today,
        totalGross: 0,
        totalCommission: 0,
        totalNet: 0,
        conversationCount: 0,
        totalDuration: 0,
        totalPenalty: 0,
      },
      transaction,
    });
    return dailyEarnings;
  }

  /**
   * Push the latest earnings dashboard to the listener over the socket.
   * Call only after the transaction that changed earnings has committed.
   * Never throws.
   * @param {string} userId - Listener ID
   */
  async emitEarningsUpdate(userId) {
    try {
      const { getIO } = require("../config/websocket");
      const io = getIO();
      const dashboard = await this.getListenerEarningsDashboard(userId);
      io.to(`user:${userId}`).emit("earnings:updated", dashboard);
    } catch (error) {
      logger.warn(`Failed to emit earnings update for user ${userId}:`, error.message);
    }
  }

  /**
   * Get billing history for a user
   * @param {string} userId - User ID
   * @param {object} filters - Filter options
   * @param {object} pagination - Pagination options
   * @returns {Promise<object>}
   */
  async getBillingHistory(userId, filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const offset = (page - 1) * limit;

      const where = { userId };

      if (filters.serviceType) {
        where.serviceType = filters.serviceType;
      }

      if (filters.startDate || filters.endDate) {
        where.chargedAt = {};
        if (filters.startDate) {
          where.chargedAt[Op.gte] = new Date(filters.startDate);
        }
        if (filters.endDate) {
          where.chargedAt[Op.lte] = new Date(filters.endDate);
        }
      }

      const charges = await CommunicationCharge.findAndCountAll({
        where,
        order: [["chargedAt", "DESC"]],
        limit,
        offset,
        include: [
          {
            model: Chat,
            as: "conversation",
            attributes: [
              "id",
              "participant1Id",
              "participant2Id",
              "serviceType",
              "status",
            ],
          },
        ],
      });

      return {
        charges: charges.rows,
        totalCount: charges.count,
        currentPage: page,
        totalPages: Math.ceil(charges.count / limit),
        hasMore: offset + limit < charges.count,
      };
    } catch (error) {
      logger.error("Error getting billing history:", error);
      throw error;
    }
  }

  /**
   * Get conversation charges
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Array<CommunicationCharge>>}
   */
  async getConversationCharges(conversationId) {
    try {
      return await CommunicationCharge.findAll({
        where: { conversationId },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "name", "role"],
          },
        ],
      });
    } catch (error) {
      logger.error("Error getting conversation charges:", error);
      throw error;
    }
  }

  /**
   * Get daily earnings summary
   * @param {string} userId - User ID
   * @param {object} filters - Filter options
   * @param {object} pagination - Pagination options
   * @returns {Promise<object>}
   */
  async getDailyEarnings(userId, filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 30 } = pagination;
      const offset = (page - 1) * limit;

      const where = { userId };

      if (filters.startDate || filters.endDate) {
        where.date = {};
        if (filters.startDate) {
          where.date[Op.gte] = filters.startDate;
        }
        if (filters.endDate) {
          where.date[Op.lte] = filters.endDate;
        }
      }

      const earnings = await DailyEarnings.findAndCountAll({
        where,
        order: [["date", "DESC"]],
        limit,
        offset,
      });

      return {
        earnings: earnings.rows,
        totalCount: earnings.count,
        currentPage: page,
        totalPages: Math.ceil(earnings.count / limit),
        hasMore: offset + limit < earnings.count,
      };
    } catch (error) {
      logger.error("Error getting daily earnings:", error);
      throw error;
    }
  }

  /**
   * Get usage dashboard for a user
   * @param {string} userId - User ID
   * @returns {Promise<object>}
   */
  async getUsageDashboard(userId) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [totalDeducted, lastCharge, sessionsThisMonth, timeSpentThisMonth] =
        await Promise.all([
          CommunicationCharge.sum("grossAmount", { where: { userId } }),
          CommunicationCharge.findOne({
            where: { userId },
            order: [["chargedAt", "DESC"]],
          }),
          CommunicationCharge.count({
            where: {
              userId,
              chargedAt: { [Op.gte]: startOfMonth },
            },
          }),
          CommunicationCharge.sum("durationSeconds", {
            where: {
              userId,
              chargedAt: { [Op.gte]: startOfMonth },
            },
          }),
        ]);

      return {
        currentPlan: "Free", // Placeholder, integrate with subscription logic if available
        renewalDate: null, // Placeholder
        totalDeducted: parseFloat(totalDeducted || 0),
        lastDeduction: lastCharge ? lastCharge.chargedAt : null,
        usageStats: {
          sessionsThisMonth,
          timeSpent: this._formatDuration(timeSpentThisMonth || 0),
        },
      };
    } catch (error) {
      logger.error("Error getting usage dashboard:", error);
      throw error;
    }
  }

  /**
   * Get listener earnings dashboard
   * @param {string} userId - User ID
   * @returns {Promise<object>}
   */
  async getListenerEarningsDashboard(userId) {
    try {
      // Both bounds come from the IST date string so the month never shifts
      // with the server's own timezone.
      const today = this._earningsToday();
      const monthStart = `${today.slice(0, 8)}01`;

      const [dailyEarnings, monthly] = await Promise.all([
        DailyEarnings.findOne({ where: { userId, date: today } }),
        DailyEarnings.findOne({
          attributes: [
            [sequelize.fn("SUM", sequelize.col("total_net")), "totalNet"],
            [sequelize.fn("SUM", sequelize.col("conversation_count")), "totalSessions"],
            [sequelize.fn("SUM", sequelize.col("total_duration")), "totalDuration"],
            [sequelize.fn("SUM", sequelize.col("total_penalty")), "totalPenalty"],
          ],
          where: {
            userId,
            date: { [Op.between]: [monthStart, today] },
          },
          raw: true,
        }),
      ]);

      return {
        date: today,
        earningsToday: dailyEarnings ? parseFloat(dailyEarnings.totalNet) : 0,
        earningsThisMonth: parseFloat(monthly?.totalNet || 0),
        totalSessionsToday: dailyEarnings ? dailyEarnings.conversationCount : 0,
        totalSessionsThisMonth: parseInt(monthly?.totalSessions || 0, 10),
        listeningTimeToday: dailyEarnings ? dailyEarnings.totalDuration : 0,
        listeningTimeThisMonth: parseInt(monthly?.totalDuration || 0, 10),
        penaltyToday: dailyEarnings ? parseFloat(dailyEarnings.totalPenalty) : 0,
        penaltyThisMonth: parseFloat(monthly?.totalPenalty || 0),
      };
    } catch (error) {
      logger.error("Error getting listener earnings dashboard:", error);
      throw error;
    }
  }

  _formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
}

module.exports = new BillingService();
