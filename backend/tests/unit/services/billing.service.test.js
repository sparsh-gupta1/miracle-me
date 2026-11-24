const billingService = require("../../../src/services/billing.service");
const commissionService = require("../../../src/services/commission.service");
const walletService = require("../../../src/services/wallet.service");
const {
    Chat,
    User,
    Commission,
    CommunicationCharge,
    DailyEarnings,
    FreeMinutesConfig,
    UserFreeMinutesUsage,
    WalletTransaction,
    sequelize,
} = require("../../../src/models");

describe("Billing Service", () => {
    let payer;
    let earner;
    let conversation;
    let commission;
    const freePayers = [];

    beforeAll(async () => {
        // Create test users
        payer = await User.create({
            name: "Payer User",
            email: "payer@example.com",
            mobileNumber: "1111111111",
            password: "password123",
            role: "user",
            isVerified: true,
        });

        earner = await User.create({
            name: "Earner User",
            email: "earner@example.com",
            mobileNumber: "2222222222",
            password: "password123",
            role: "listener",
            isVerified: true,
        });

        // Create wallets
        await walletService.createWallet(payer.id);
        await walletService.ensureUserWallets(earner.id, "listener");

        // Add balance to payer
        await walletService.creditWallet(
            payer.id,
            5000.0,
            "recharge",
            "test-recharge-billing",
            "Test recharge for billing"
        );

        // Create commission rule
        commission = await Commission.create({
            role: "listener",
            serviceType: "chat",
            commissionPercentage: 20.0,
            effectiveFrom: new Date(),
            createdBy: payer.id,
            isActive: true,
        });

        // Find or create conversation to avoid unique constraint violations
        const [chat, created] = await Chat.findOrCreate({
            where: {
                participant1Id: payer.id,
                participant2Id: earner.id,
            },
            defaults: {
                serviceType: "chat",
                status: "created",
            },
        });
        conversation = chat;
        if (!created) {
            await conversation.update({
                status: "created",
                startedAt: null,
                endedAt: null,
                durationSeconds: null,
            });
        }
    });

    afterAll(async () => {
        // Cleanup
        await CommunicationCharge.destroy({ where: {} });
        await DailyEarnings.destroy({ where: {} });
        await Commission.destroy({ where: {} });
        await Chat.destroy({ where: {} });
        await User.destroy({ where: { email: ["payer@example.com", "earner@example.com", "payer_idemp@example.com"] } });
        await sequelize.close();
    });

    async function createFreeBillingScenario(durationSeconds, freeSeconds) {
        const freePayer = await User.create({
            name: "Free Payer",
            email: `free-payer-${Date.now()}-${Math.random()}@example.com`,
            mobileNumber: `${Date.now()}`.slice(-10),
            password: "password123",
            role: "user",
            isVerified: true,
        });
        freePayers.push(freePayer);

        await walletService.createWallet(freePayer.id);
        await walletService.creditWallet(
            freePayer.id,
            5000,
            "recharge",
            `free-recharge-${freePayer.id}`,
            "Free-minute billing test recharge"
        );

        await FreeMinutesConfig.findOrCreate({
            where: { service_type: "chat" },
            defaults: {
                service_type: "chat",
                free_minutes: 20,
                is_active: true,
                created_by: freePayer.id,
            },
        });

        await UserFreeMinutesUsage.create({
            user_id: freePayer.id,
            service_type: "chat",
            total_free_seconds: freeSeconds,
            consumed_seconds: 0,
            remaining_seconds: freeSeconds,
        });

        const freeConversation = await Chat.create({
            participant1Id: freePayer.id,
            participant2Id: earner.id,
            serviceType: "chat",
            status: "ended",
            durationSeconds,
            endedAt: new Date(),
        });

        return { freePayer, freeConversation };
    }

    describe("calculateRatePerSecond", () => {
        it("should calculate rate per second from price per minute", () => {
            const pricePerMinute = 60.0;
            const ratePerSecond = billingService.calculateRatePerSecond(pricePerMinute);

            expect(ratePerSecond).toBe(1.0);
        });

        it("should handle decimal precision correctly", () => {
            const pricePerMinute = 30.0;
            const ratePerSecond = billingService.calculateRatePerSecond(pricePerMinute);

            expect(ratePerSecond).toBe(0.5);
        });

        it("should use 6 decimal places for precision", () => {
            const pricePerMinute = 17.0;
            const ratePerSecond = billingService.calculateRatePerSecond(pricePerMinute);

            expect(ratePerSecond).toBeCloseTo(0.283333, 6);
        });
    });

    describe("calculateBillingAmount", () => {
        it("should calculate billing amounts correctly", async () => {
            const serviceType = "chat";
            const durationSeconds = 300; // 5 minutes
            const pricingInfo = {
                price_per_minute: 30.0,
                source: "global",
                pricing_id: null,
            };
            const userRole = "listener";

            const result = await billingService.calculateBillingAmount(
                serviceType,
                durationSeconds,
                pricingInfo,
                userRole
            );

            expect(result.pricePerMinute).toBe(30.0);
            expect(result.ratePerSecond).toBe(0.5);
            expect(result.grossAmount).toBe(150.0); // 300 * 0.5
            expect(result.commissionPercentage).toBe(20.0);
            expect(result.commissionAmount).toBe(30.0); // 150 * 0.2
            expect(result.netEarning).toBe(120.0); // 150 - 30
        });

        it("should handle zero commission if not configured", async () => {
            const serviceType = "audio_call";
            const durationSeconds = 120;
            const pricingInfo = {
                price_per_minute: 60.0,
                source: "custom",
                pricing_id: "test-id",
            };
            const userRole = "astrologer";

            const result = await billingService.calculateBillingAmount(
                serviceType,
                durationSeconds,
                pricingInfo,
                userRole
            );

            expect(result.grossAmount).toBe(120.0);
            expect(result.commissionPercentage).toBe(0);
            expect(result.commissionAmount).toBe(0);
            expect(result.netEarning).toBe(120.0);
        });

        it("should round amounts to 2 decimal places", async () => {
            const serviceType = "chat";
            const durationSeconds = 123; // Odd duration
            const pricingInfo = {
                price_per_minute: 17.0,
                source: "global",
                pricing_id: null,
            };
            const userRole = "listener";

            const result = await billingService.calculateBillingAmount(
                serviceType,
                durationSeconds,
                pricingInfo,
                userRole
            );

            // 123 * (17/60) = 34.85
            expect(result.grossAmount).toBe(34.85);
            expect(result.commissionAmount).toBe(6.97); // 34.85 * 0.2
            expect(result.netEarning).toBe(27.88); // 34.85 - 6.97
        });
    });

    describe("processConversationBilling", () => {
        it("should process billing for ended conversation", async () => {
            // Start and end conversation
            await conversation.update({
                status: "started",
                startedAt: new Date(Date.now() - 300000), // 5 minutes ago
            });

            await conversation.update({
                status: "ended",
                endedAt: new Date(),
                durationSeconds: 300,
            });

            // Mock pricing
            const pricingInfo = {
                price_per_minute: 30.0,
                source: "global",
                pricing_id: null,
            };

            jest.spyOn(require("../../../src/services/pricing.service"), "getEffectivePricing")
                .mockResolvedValue(pricingInfo);

            const payerBalanceBefore = await walletService.getWalletBalance(payer.id);
            const earnerBalanceBefore = await walletService.getWalletBalance(earner.id, "earning");

            const result = await billingService.processConversationBilling(conversation.id);

            expect(result).toBeDefined();
            expect(result.charge).toBeDefined();
            expect(result.payerTransaction).toBeDefined();
            expect(result.earnerTransaction).toBeDefined();

            // Verify amounts
            expect(parseFloat(result.charge.grossAmount)).toBe(150.0);
            expect(parseFloat(result.charge.commissionAmount)).toBe(30.0);
            expect(parseFloat(result.charge.netEarning)).toBe(120.0);

            // Verify wallet balances
            const payerBalanceAfter = await walletService.getWalletBalance(payer.id);
            const earnerBalanceAfter = await walletService.getWalletBalance(earner.id, "earning");

            expect(payerBalanceAfter).toBe(payerBalanceBefore - 150.0);
            expect(earnerBalanceAfter).toBe(earnerBalanceBefore + 120.0);

            // Verify daily earnings updated
            const today = new Date().toISOString().split("T")[0];
            const dailyEarnings = await DailyEarnings.findOne({
                where: { userId: earner.id, date: today },
            });

            expect(dailyEarnings).toBeDefined();
            expect(parseFloat(dailyEarnings.totalGross)).toBe(150.0);
            expect(parseFloat(dailyEarnings.totalCommission)).toBe(30.0);
            expect(parseFloat(dailyEarnings.totalNet)).toBe(120.0);
            expect(dailyEarnings.conversationCount).toBe(1);
        });

        it("should skip billing for zero duration conversations", async () => {
            await conversation.update({
                status: "ended",
                durationSeconds: 0,
            });

            const result = await billingService.processConversationBilling(conversation.id);

            expect(result.message).toBe("No billing required for zero duration");
        });

        it("should throw error if conversation not ended", async () => {
            await conversation.update({
                status: "started",
            });

            await expect(
                billingService.processConversationBilling(conversation.id)
            ).rejects.toThrow("Conversation must be ended before billing");
        });

        it("should be idempotent - prevent duplicate billing", async () => {
            // Create a temporary payer to avoid unique constraint and transaction reference reuse
            const payerIdempotency = await User.create({
                name: "Payer Idempotency",
                email: "payer_idemp@example.com",
                mobileNumber: "1111111113",
                password: "password123",
                role: "user",
                isVerified: true,
            });
            await walletService.createWallet(payerIdempotency.id);
            await walletService.creditWallet(
                payerIdempotency.id,
                5000.0,
                "recharge",
                "test-recharge-idemp",
                "Test recharge for idempotency"
            );

            const testConversation = await Chat.create({
                participant1Id: payerIdempotency.id,
                participant2Id: earner.id,
                serviceType: "chat",
                status: "ended",
                durationSeconds: 60,
                endedAt: new Date(),
            });

            const pricingInfo = {
                price_per_minute: 30.0,
                source: "global",
                pricing_id: null,
            };

            jest.spyOn(require("../../../src/services/pricing.service"), "getEffectivePricing")
                .mockResolvedValue(pricingInfo);

            const balanceBefore = await walletService.getWalletBalance(payerIdempotency.id);

            // First billing
            await billingService.processConversationBilling(testConversation.id);

            // Second billing (should be idempotent)
            await billingService.processConversationBilling(testConversation.id);

            const balanceAfter = await walletService.getWalletBalance(payerIdempotency.id);

            // Balance should only be debited once
            expect(balanceAfter).toBe(balanceBefore - 30.0); // 60 seconds * 0.5
        });

        it("should credit provider earnings without charging a fully free session", async () => {
            const { freePayer, freeConversation } = await createFreeBillingScenario(300, 600);
            const payerBalanceBefore = await walletService.getWalletBalance(freePayer.id);
            const earnerBalanceBefore = await walletService.getWalletBalance(earner.id, "earning");

            const result = await billingService.processConversationBilling(freeConversation.id);

            expect(result.payerTransaction).toBeNull();
            expect(parseFloat(result.earnerTransaction.amount)).toBe(120);
            expect(await walletService.getWalletBalance(freePayer.id)).toBe(payerBalanceBefore);
            expect(await walletService.getWalletBalance(earner.id, "earning")).toBe(earnerBalanceBefore + 120);
            expect(parseFloat(result.charge.grossAmount)).toBe(0);
            expect(result.charge.metadata.freeSecondsUsed).toBe(300);
            expect(result.charge.metadata.earningSeconds).toBe(300);

            const usage = await UserFreeMinutesUsage.findOne({
                where: { user_id: freePayer.id, service_type: "chat" },
            });
            expect(usage.remaining_seconds).toBe(300);
        });

        it("should charge only paid seconds while crediting earnings for the full session", async () => {
            const { freePayer, freeConversation } = await createFreeBillingScenario(480, 300);
            const payerBalanceBefore = await walletService.getWalletBalance(freePayer.id);
            const earnerBalanceBefore = await walletService.getWalletBalance(earner.id, "earning");

            const result = await billingService.processConversationBilling(freeConversation.id);

            expect(parseFloat(result.payerTransaction.amount)).toBe(90);
            expect(parseFloat(result.earnerTransaction.amount)).toBe(192);
            expect(await walletService.getWalletBalance(freePayer.id)).toBe(payerBalanceBefore - 90);
            expect(await walletService.getWalletBalance(earner.id, "earning")).toBe(earnerBalanceBefore + 192);
            expect(result.charge.metadata.freeSecondsUsed).toBe(300);
            expect(result.charge.metadata.billableSeconds).toBe(180);
            expect(result.charge.metadata.earningSeconds).toBe(480);
        });

        it("should bill the user even when the listener is passed as explicit payer", async () => {
            // Regression: a listener who sent the first chat message was stored as payer, so the
            // "user" became the earner and commission lookup threw on enum_commissions_role.
            const { freePayer, freeConversation } = await createFreeBillingScenario(300, 0);
            const payerBalanceBefore = await walletService.getWalletBalance(freePayer.id);
            const earnerBalanceBefore = await walletService.getWalletBalance(earner.id, "earning");

            const result = await billingService.processConversationBilling(freeConversation.id, earner.id);

            expect(result.charge.userId).toBe(freePayer.id);
            expect(await walletService.getWalletBalance(freePayer.id)).toBeLessThan(payerBalanceBefore);
            expect(await walletService.getWalletBalance(earner.id, "earning")).toBeGreaterThan(earnerBalanceBefore);
        });

        it("should handle exact and shorter free-minute boundaries", async () => {
            const exact = await createFreeBillingScenario(300, 300);
            const shorter = await createFreeBillingScenario(240, 300);

            const exactResult = await billingService.processConversationBilling(exact.freeConversation.id);
            const shorterResult = await billingService.processConversationBilling(shorter.freeConversation.id);

            expect(exactResult.payerTransaction).toBeNull();
            expect(shorterResult.payerTransaction).toBeNull();
            expect(parseFloat(exactResult.earnerTransaction.amount)).toBe(120);
            expect(parseFloat(shorterResult.earnerTransaction.amount)).toBe(96);
        });

        it("should not consume free minutes or credit earnings twice on duplicate free billing", async () => {
            const { freePayer, freeConversation } = await createFreeBillingScenario(300, 600);
            const earnerBalanceBefore = await walletService.getWalletBalance(earner.id, "earning");

            await billingService.processConversationBilling(freeConversation.id);
            await billingService.processConversationBilling(freeConversation.id);

            const usage = await UserFreeMinutesUsage.findOne({
                where: { user_id: freePayer.id, service_type: "chat" },
            });
            const earningTransactions = await WalletTransaction.count({
                where: {
                    referenceType: "conversation",
                    referenceId: freeConversation.id,
                    type: "credit",
                },
            });

            expect(usage.consumed_seconds).toBe(300);
            expect(earningTransactions).toBe(1);
            expect(await walletService.getWalletBalance(earner.id, "earning")).toBe(earnerBalanceBefore + 120);
        });
    });

    describe("updateDailyEarnings", () => {
        it("should create daily earnings if not exists", async () => {
            const t = await sequelize.transaction();

            const result = await billingService.updateDailyEarnings(
                earner.id,
                100.0,
                20.0,
                80.0,
                60, // durationSeconds
                t
            );

            await t.commit();

            expect(result).toBeDefined();
            expect(parseFloat(result.totalGross)).toBeGreaterThan(0);
            expect(parseFloat(result.totalCommission)).toBeGreaterThan(0);
            expect(parseFloat(result.totalNet)).toBeGreaterThan(0);
        });

        it("should update existing daily earnings", async () => {
            const today = billingService._earningsToday();
            const existingEarnings = await DailyEarnings.findOne({
                where: { userId: earner.id, date: today },
            });

            const grossBefore = parseFloat(existingEarnings.totalGross);
            const t = await sequelize.transaction();

            await billingService.updateDailyEarnings(earner.id, 50.0, 10.0, 40.0, 60, t);

            await t.commit();

            const updatedEarnings = await DailyEarnings.findOne({
                where: { userId: earner.id, date: today },
            });

            expect(parseFloat(updatedEarnings.totalGross)).toBe(grossBefore + 50.0);
            expect(updatedEarnings.conversationCount).toBeGreaterThan(
                existingEarnings.conversationCount
            );
        });
    });

    describe("getBillingHistory", () => {
        it("should retrieve billing history with pagination", async () => {
            const result = await billingService.getBillingHistory(
                payer.id,
                {},
                { page: 1, limit: 10 }
            );

            expect(result).toBeDefined();
            expect(result.charges).toBeInstanceOf(Array);
            expect(result.totalCount).toBeGreaterThan(0);
        });

        it("should filter by service type", async () => {
            const result = await billingService.getBillingHistory(
                payer.id,
                { serviceType: "chat" },
                { page: 1, limit: 10 }
            );

            expect(result.charges.every((c) => c.serviceType === "chat")).toBe(true);
        });
    });

    describe("getDailyEarnings", () => {
        it("should retrieve daily earnings with pagination", async () => {
            const result = await billingService.getDailyEarnings(
                earner.id,
                {},
                { page: 1, limit: 30 }
            );

            expect(result).toBeDefined();
            expect(result.earnings).toBeInstanceOf(Array);
            expect(result.totalCount).toBeGreaterThan(0);
        });
    });

    describe("getUsageDashboard", () => {
        it("should return usage dashboard data", async () => {
            const result = await billingService.getUsageDashboard(payer.id);

            expect(result).toBeDefined();
            expect(result.totalDeducted).toBeDefined();
            expect(result.usageStats).toBeDefined();
            expect(result.usageStats.timeSpent).toMatch(/\d+h \d+m/);
        });
    });

    describe("applyDailyPenalty", () => {
        it("should reduce net earnings and track penalty without counting a session", async () => {
            const today = billingService._earningsToday();
            await billingService.updateDailyEarnings(earner.id, 10.0, 2.0, 8.0, 60, null);
            const before = await DailyEarnings.findOne({ where: { userId: earner.id, date: today } });

            const t = await sequelize.transaction();
            await billingService.applyDailyPenalty(earner.id, 1.5, t);
            await t.commit();

            const after = await DailyEarnings.findOne({ where: { userId: earner.id, date: today } });
            expect(parseFloat(after.totalNet)).toBeCloseTo(parseFloat(before.totalNet) - 1.5, 2);
            expect(parseFloat(after.totalPenalty)).toBeCloseTo(parseFloat(before.totalPenalty) + 1.5, 2);
            expect(after.conversationCount).toBe(before.conversationCount);
        });
    });

    describe("getListenerEarningsDashboard", () => {
        it("should return listener earnings dashboard data", async () => {
            const result = await billingService.getListenerEarningsDashboard(earner.id);

            expect(result).toBeDefined();
            expect(result.earningsToday).toBeDefined();
            expect(result.earningsThisMonth).toBeDefined();
            expect(result.totalSessionsToday).toBeDefined();
            expect(result.totalSessionsThisMonth).toBeGreaterThanOrEqual(result.totalSessionsToday);
            expect(result.listeningTimeThisMonth).toBeGreaterThanOrEqual(result.listeningTimeToday);
            expect(result.penaltyThisMonth).toBeGreaterThanOrEqual(result.penaltyToday);
            expect(result.date).toBe(billingService._earningsToday());
        });

        it("should exclude previous month and future rows from this month", async () => {
            const today = billingService._earningsToday();
            const monthStart = `${today.slice(0, 8)}01`;
            const lastMonth = new Date(`${monthStart}T00:00:00Z`);
            lastMonth.setUTCDate(0);
            const nextMonth = new Date(`${monthStart}T00:00:00Z`);
            nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

            const before = await billingService.getListenerEarningsDashboard(earner.id);

            const rows = await DailyEarnings.bulkCreate([
                { userId: earner.id, date: lastMonth.toISOString().slice(0, 10), totalNet: 999, conversationCount: 9 },
                { userId: earner.id, date: nextMonth.toISOString().slice(0, 10), totalNet: 777, conversationCount: 7 },
            ]);

            const after = await billingService.getListenerEarningsDashboard(earner.id);
            await DailyEarnings.destroy({ where: { id: rows.map((r) => r.id) } });

            expect(after.earningsThisMonth).toBeCloseTo(before.earningsThisMonth, 2);
            expect(after.totalSessionsThisMonth).toBe(before.totalSessionsThisMonth);
        });
    });

    describe("emitEarningsUpdate", () => {
        it("should emit earnings:updated to the user room", async () => {
            const websocket = require("../../../src/config/websocket");
            const emit = jest.fn();
            const to = jest.fn().mockReturnValue({ emit });
            const spy = jest.spyOn(websocket, "getIO").mockReturnValue({ to });

            await billingService.emitEarningsUpdate(earner.id);

            expect(to).toHaveBeenCalledWith(`user:${earner.id}`);
            expect(emit).toHaveBeenCalledWith(
                "earnings:updated",
                expect.objectContaining({ earningsToday: expect.any(Number), earningsThisMonth: expect.any(Number) })
            );
            spy.mockRestore();
        });

        it("should not throw when socket server is unavailable", async () => {
            const websocket = require("../../../src/config/websocket");
            const spy = jest.spyOn(websocket, "getIO").mockImplementation(() => {
                throw new Error("Socket.IO not initialized");
            });

            await expect(billingService.emitEarningsUpdate(earner.id)).resolves.toBeUndefined();
            spy.mockRestore();
        });
    });
});
