const conversationService = require("../../src/services/conversation.service");
const billingService = require("../../src/services/billing.service");
const walletService = require("../../src/services/wallet.service");
const commissionService = require("../../src/services/commission.service");
const withdrawalService = require("../../src/services/withdrawal.service");
const pricingService = require("../../src/services/pricing.service");
const {
    User,
    Commission,
    WithdrawalRule,
    sequelize,
} = require("../../src/models");

describe("End-to-End Wallet & Billing Flow", () => {
    let admin;
    let payer;
    let listener;
    let commission;
    let withdrawalRule;

    beforeAll(async () => {
        // Create admin
        admin = await User.create({
            name: "Admin User",
            email: "e2eadmin@example.com",
            mobileNumber: "8888888888",
            password: "password123",
            role: "admin",
            isVerified: true,
        });

        // Create payer (user)
        payer = await User.create({
            name: "Payer User",
            email: "e2epayer@example.com",
            mobileNumber: "9999999999",
            password: "password123",
            role: "user",
            isVerified: true,
        });

        // Create listener (earner)
        listener = await User.create({
            name: "Listener User",
            email: "e2elistener@example.com",
            mobileNumber: "1010101010",
            password: "password123",
            role: "listener",
            isVerified: true,
        });

        // Create commission rule
        commission = await commissionService.createCommissionRule(
            {
                role: "listener",
                serviceType: "chat",
                commissionPercentage: 20.0,
            },
            admin.id
        );

        // Create withdrawal rule
        const today = new Date().getDay();
        withdrawalRule = await withdrawalService.createWithdrawalRule(
            {
                minAmount: 100.0,
                allowedDays: [today],
            },
            admin.id
        );

        // Mock pricing service
        jest.spyOn(pricingService, "getEffectivePricing").mockResolvedValue({
            price_per_minute: 30.0,
            source: "global",
            pricing_id: null,
        });
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe("Complete Conversation & Billing Flow", () => {
        let conversation;

        it("Step 1: Payer recharges wallet", async () => {
            // Create wallet
            await walletService.createWallet(payer.id);

            // Recharge wallet
            const transaction = await walletService.creditWallet(
                payer.id,
                5000.0,
                "recharge",
                "e2e-recharge-001",
                "E2E test recharge"
            );

            expect(transaction.type).toBe("credit");
            expect(parseFloat(transaction.amount)).toBe(5000.0);

            const balance = await walletService.getWalletBalance(payer.id);
            expect(balance).toBe(5000.0);

            console.log("✓ Payer wallet recharged: ₹5000");
        });

        it("Step 2: Listener wallet is created", async () => {
            await walletService.createWallet(listener.id, "earning");

            const balance = await walletService.getWalletBalance(listener.id, "earning");
            expect(balance).toBe(0.0);

            console.log("✓ Listener wallet created with ₹0 balance");
        });

        it("Step 3: Create and start conversation", async () => {
            conversation = await conversationService.createConversation(
                payer.id,
                listener.id,
                "chat"
            );

            expect(conversation.status).toBe("created");
            expect(conversation.serviceType).toBe("chat");

            await conversationService.startConversation(conversation.id);

            const updated = await conversationService.getConversationDetails(conversation.id);
            expect(updated.status).toBe("started");
            expect(updated.startedAt).toBeDefined();

            console.log("✓ Conversation created and started");
        });

        it("Step 4: Simulate conversation duration", async () => {
            // Wait 2 seconds to simulate conversation
            await new Promise((resolve) => setTimeout(resolve, 2000));

            console.log("✓ Conversation in progress (2 seconds)...");
        });

        it("Step 5: End conversation and process billing", async () => {
            const payerBalanceBefore = await walletService.getWalletBalance(payer.id);
            const listenerBalanceBefore = await walletService.getWalletBalance(listener.id, "earning");

            const result = await conversationService.endConversation(conversation.id, { reason: "manual" });

            expect(result.conversation.status).toBe("ended");
            expect(result.conversation.durationSeconds).toBeGreaterThan(0);

            const durationSeconds = result.conversation.durationSeconds;
            const expectedGross = durationSeconds * 0.5; // 30/60 = 0.5 per second
            const expectedCommission = expectedGross * 0.2;
            const expectedNet = expectedGross - expectedCommission;

            // Verify billing
            expect(result.billing).toBeDefined();
            expect(parseFloat(result.billing.billingData.grossAmount)).toBeCloseTo(
                expectedGross,
                2
            );
            expect(parseFloat(result.billing.billingData.commissionAmount)).toBeCloseTo(
                expectedCommission,
                2
            );
            expect(parseFloat(result.billing.billingData.netEarning)).toBeCloseTo(
                expectedNet,
                2
            );

            // Verify wallet balances
            const payerBalanceAfter = await walletService.getWalletBalance(payer.id);
            const listenerBalanceAfter = await walletService.getWalletBalance(listener.id, "earning");

            expect(payerBalanceAfter).toBeCloseTo(payerBalanceBefore - expectedGross, 2);
            expect(listenerBalanceAfter).toBeCloseTo(
                listenerBalanceBefore + expectedNet,
                2
            );

            console.log(`✓ Conversation ended (${durationSeconds}s)`);
            console.log(`  Gross amount: ₹${expectedGross.toFixed(2)}`);
            console.log(`  Commission (20%): ₹${expectedCommission.toFixed(2)}`);
            console.log(`  Net earning: ₹${expectedNet.toFixed(2)}`);
            console.log(`  Payer balance: ₹${payerBalanceAfter.toFixed(2)}`);
            console.log(`  Listener balance: ₹${listenerBalanceAfter.toFixed(2)}`);
        });

        it("Step 6: Verify daily earnings updated", async () => {
            const today = new Date().toISOString().split("T")[0];
            const dailyEarnings = await billingService.getDailyEarnings(
                listener.id,
                { startDate: today, endDate: today },
                { page: 1, limit: 1 }
            );

            expect(dailyEarnings.earnings.length).toBeGreaterThan(0);
            expect(parseFloat(dailyEarnings.earnings[0].totalGross)).toBeGreaterThan(0);
            expect(dailyEarnings.earnings[0].conversationCount).toBeGreaterThan(0);

            console.log("✓ Daily earnings updated");
            console.log(
                `  Total gross: ₹${dailyEarnings.earnings[0].totalGross}`
            );
            console.log(
                `  Total net: ₹${dailyEarnings.earnings[0].totalNet}`
            );
            console.log(
                `  Conversations: ${dailyEarnings.earnings[0].conversationCount}`
            );
        });
    });

    describe("Complete Withdrawal Flow", () => {
        let withdrawalRequest;

        it("Step 1: Listener creates withdrawal request", async () => {
            // Credit listener earning wallet so they have enough balance for withdrawal
            await walletService.creditWallet(
                listener.id,
                1000.0,
                "recharge",
                "e2e-listener-credit-001",
                "E2E test credit for listener",
                {},
                null,
                "earning"
            );

            const listenerBalance = await walletService.getWalletBalance(listener.id, "earning");

            // Request withdrawal (less than balance)
            const amount = Math.min(listenerBalance - 10, 500);

            withdrawalRequest = await withdrawalService.createWithdrawalRequest(
                listener.id,
                amount
            );

            expect(withdrawalRequest.status).toBe("pending");
            expect(parseFloat(withdrawalRequest.amount)).toBe(amount);

            console.log(`✓ Withdrawal request created: ₹${amount}`);
        });

        it("Step 2: Validate withdrawal request", async () => {
            const validation = await withdrawalService.validateWithdrawalRequest(
                listener.id,
                parseFloat(withdrawalRequest.amount)
            );

            // Should fail because there's already a pending request
            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain(
                "You already have a pending withdrawal request"
            );

            console.log("✓ Validation prevents duplicate requests");
        });

        it("Step 3: Admin approves withdrawal", async () => {
            const listenerBalanceBefore = await walletService.getWalletBalance(listener.id, "earning");

            const result = await withdrawalService.approveWithdrawal(
                withdrawalRequest.id,
                admin.id
            );

            expect(result.request.status).toBe("approved");
            expect(result.request.processedBy).toBe(admin.id);
            expect(result.walletTransaction).toBeDefined();

            const listenerBalanceAfter = await walletService.getWalletBalance(listener.id, "earning");
            expect(listenerBalanceAfter).toBeCloseTo(
                listenerBalanceBefore - parseFloat(withdrawalRequest.amount),
                2
            );

            console.log("✓ Withdrawal approved by admin");
            console.log(
                `  Amount withdrawn: ₹${withdrawalRequest.amount}`
            );
            console.log(`  Remaining balance: ₹${listenerBalanceAfter.toFixed(2)}`);
        });

        it("Step 4: Verify withdrawal statistics", async () => {
            const stats = await withdrawalService.getWithdrawalStats(listener.id);

            expect(stats.totalRequests).toBeGreaterThan(0);
            expect(stats.approvedRequests).toBeGreaterThan(0);
            expect(stats.totalWithdrawn).toBeGreaterThan(0);

            console.log("✓ Withdrawal statistics:");
            console.log(`  Total requests: ${stats.totalRequests}`);
            console.log(`  Approved: ${stats.approvedRequests}`);
            console.log(`  Total withdrawn: ₹${stats.totalWithdrawn}`);
        });
    });

    describe("Wallet Transaction History", () => {
        it("Should show complete transaction history for payer", async () => {
            const transactions = await walletService.getWalletTransactions(
                payer.id,
                {},
                { page: 1, limit: 10 }
            );

            expect(transactions.transactions.length).toBeGreaterThan(0);

            console.log("\n✓ Payer transaction history:");
            transactions.transactions.forEach((tx) => {
                console.log(
                    `  ${tx.type.toUpperCase()}: ₹${tx.amount} - ${tx.description}`
                );
            });
        });

        it("Should show complete transaction history for listener", async () => {
            const transactions = await walletService.getWalletTransactions(
                listener.id,
                { walletType: "earning" },
                { page: 1, limit: 10 }
            );

            expect(transactions.transactions.length).toBeGreaterThan(0);

            console.log("\n✓ Listener transaction history:");
            transactions.transactions.forEach((tx) => {
                console.log(
                    `  ${tx.type.toUpperCase()}: ₹${tx.amount} - ${tx.description}`
                );
            });
        });
    });

    describe("Final Balance Verification", () => {
        it("Should verify all balances are correct", async () => {
            const payerBalance = await walletService.getWalletBalance(payer.id);
            const listenerBalance = await walletService.getWalletBalance(listener.id, "earning");

            const payerStats = await walletService.getWalletStats(payer.id);
            const listenerStats = await walletService.getWalletStats(listener.id, "earning");

            console.log("\n✓ Final balances:");
            console.log(`  Payer: ₹${payerBalance.toFixed(2)}`);
            console.log(`    Total credits: ₹${payerStats.totalCredits}`);
            console.log(`    Total debits: ₹${payerStats.totalDebits}`);
            console.log(`  Listener: ₹${listenerBalance.toFixed(2)}`);
            console.log(`    Total credits: ₹${listenerStats.totalCredits}`);
            console.log(`    Total debits: ₹${listenerStats.totalDebits}`);

            // Verify balance integrity
            expect(payerBalance).toBeCloseTo(
                payerStats.totalCredits - payerStats.totalDebits,
                2
            );
            expect(listenerBalance).toBeCloseTo(
                listenerStats.totalCredits - listenerStats.totalDebits,
                2
            );

            console.log("\n✅ All balances verified!");
        });
    });
});
