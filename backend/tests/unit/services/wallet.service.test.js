const walletService = require("../../../src/services/wallet.service");
const { Wallet, WalletTransaction, Ledger, User, sequelize } = require("../../../src/models");

describe("Wallet Service", () => {
    let testUser;
    let testWallet;

    beforeAll(async () => {
        // Create test user
        testUser = await User.create({
            name: "Test User",
            email: "test@example.com",
            mobileNumber: "1234567890",
            password: "password123",
            role: "listener",
            isVerified: true,
        });
    });

    afterAll(async () => {
        // Cleanup
        await WalletTransaction.destroy({ where: {} });
        await Ledger.destroy({ where: {} });
        await Wallet.destroy({ where: {} });
        await User.destroy({ where: { id: testUser.id } });
        await sequelize.close();
    });

    describe("createWallet", () => {
        it("should create a new wallet for a user", async () => {
            const wallet = await walletService.createWallet(testUser.id);

            expect(wallet).toBeDefined();
            expect(wallet.userId).toBe(testUser.id);
            expect(parseFloat(wallet.balance)).toBe(0.0);
            expect(wallet.currency).toBe("INR");
            expect(wallet.isActive).toBe(true);

            testWallet = wallet;
        });

        it("should return existing wallet if already created", async () => {
            const wallet = await walletService.createWallet(testUser.id);

            expect(wallet.id).toBe(testWallet.id);
        });
    });

    describe("getWalletByUserId", () => {
        it("should retrieve wallet by user ID", async () => {
            const wallet = await walletService.getWalletByUserId(testUser.id);

            expect(wallet).toBeDefined();
            expect(wallet.id).toBe(testWallet.id);
            expect(wallet.user).toBeDefined();
            expect(wallet.user.id).toBe(testUser.id);
        });

        it("should throw error if wallet not found", async () => {
            const fakeUserId = "00000000-0000-0000-0000-000000000000";

            await expect(walletService.getWalletByUserId(fakeUserId)).rejects.toThrow(
                "Wallet not found for this user"
            );
        });
    });

    describe("getWalletBalance", () => {
        it("should return current wallet balance", async () => {
            const balance = await walletService.getWalletBalance(testUser.id);

            expect(balance).toBe(0.0);
        });
    });

    describe("creditWallet", () => {
        it("should credit wallet and create transaction record", async () => {
            const amount = 1000.0;
            const transaction = await walletService.creditWallet(
                testUser.id,
                amount,
                "recharge",
                "11111111-1111-4111-a111-111111111111",
                "Test recharge"
            );

            expect(transaction).toBeDefined();
            expect(transaction.type).toBe("credit");
            expect(parseFloat(transaction.amount)).toBe(amount);
            expect(parseFloat(transaction.balanceBefore)).toBe(0.0);
            expect(parseFloat(transaction.balanceAfter)).toBe(amount);
            expect(transaction.referenceType).toBe("recharge");
            expect(transaction.referenceId).toBe("11111111-1111-4111-a111-111111111111");

            // Verify wallet balance updated
            const balance = await walletService.getWalletBalance(testUser.id);
            expect(balance).toBe(amount);

            // Verify ledger entry created
            const ledgerEntry = await Ledger.findOne({
                where: { walletTransactionId: transaction.id },
            });
            expect(ledgerEntry).toBeDefined();
            expect(ledgerEntry.creditWalletId).toBe(testWallet.id);
            expect(parseFloat(ledgerEntry.amount)).toBe(amount);
        });

        it("should be idempotent - prevent duplicate transactions", async () => {
            const amount = 500.0;
            const referenceId = "test-recharge-002";

            // First credit
            const transaction1 = await walletService.creditWallet(
                testUser.id,
                amount,
                "recharge",
                referenceId,
                "Test recharge 2"
            );

            // Second credit with same reference
            const transaction2 = await walletService.creditWallet(
                testUser.id,
                amount,
                "recharge",
                referenceId,
                "Test recharge 2"
            );

            // Should return same transaction
            expect(transaction1.id).toBe(transaction2.id);

            // Balance should only be credited once
            const balance = await walletService.getWalletBalance(testUser.id);
            expect(balance).toBe(1500.0); // 1000 + 500, not 2000
        });

        it("should handle concurrent credit operations safely", async () => {
            const amount = 100.0;

            // Simulate concurrent credits
            const promises = Array.from({ length: 5 }, (_, i) =>
                walletService.creditWallet(
                    testUser.id,
                    amount,
                    "recharge",
                    `concurrent-${i}`,
                    `Concurrent credit ${i}`
                )
            );

            await Promise.all(promises);

            const balance = await walletService.getWalletBalance(testUser.id);
            expect(balance).toBe(2000.0); // 1500 + (5 * 100)
        });
    });

    describe("debitWallet", () => {
        it("should debit wallet and create transaction record", async () => {
            const amount = 200.0;
            const balanceBefore = await walletService.getWalletBalance(testUser.id);

            const transaction = await walletService.debitWallet(
                testUser.id,
                amount,
                "withdrawal",
                "test-withdrawal-001",
                "Test withdrawal"
            );

            expect(transaction).toBeDefined();
            expect(transaction.type).toBe("debit");
            expect(parseFloat(transaction.amount)).toBe(amount);
            expect(parseFloat(transaction.balanceBefore)).toBe(balanceBefore);
            expect(parseFloat(transaction.balanceAfter)).toBe(balanceBefore - amount);

            // Verify wallet balance updated
            const balance = await walletService.getWalletBalance(testUser.id);
            expect(balance).toBe(balanceBefore - amount);

            // Verify ledger entry created
            const ledgerEntry = await Ledger.findOne({
                where: { walletTransactionId: transaction.id },
            });
            expect(ledgerEntry).toBeDefined();
            expect(ledgerEntry.debitWalletId).toBe(testWallet.id);
            expect(parseFloat(ledgerEntry.amount)).toBe(amount);
        });

        it("should throw error if insufficient balance", async () => {
            const balance = await walletService.getWalletBalance(testUser.id);
            const amount = balance + 100.0;

            await expect(
                walletService.debitWallet(
                    testUser.id,
                    amount,
                    "withdrawal",
                    "test-withdrawal-002",
                    "Test withdrawal"
                )
            ).rejects.toThrow("Insufficient balance");
        });

        it("should be idempotent - prevent duplicate debits", async () => {
            const amount = 100.0;
            const referenceId = "test-withdrawal-003";
            const balanceBefore = await walletService.getWalletBalance(testUser.id);

            // First debit
            const transaction1 = await walletService.debitWallet(
                testUser.id,
                amount,
                "withdrawal",
                referenceId,
                "Test withdrawal 3"
            );

            // Second debit with same reference
            const transaction2 = await walletService.debitWallet(
                testUser.id,
                amount,
                "withdrawal",
                referenceId,
                "Test withdrawal 3"
            );

            // Should return same transaction
            expect(transaction1.id).toBe(transaction2.id);

            // Balance should only be debited once
            const balance = await walletService.getWalletBalance(testUser.id);
            expect(balance).toBe(balanceBefore - amount);
        });
    });

    describe("validateSufficientBalance", () => {
        it("should return true if sufficient balance", async () => {
            const balance = await walletService.getWalletBalance(testUser.id);
            const result = await walletService.validateSufficientBalance(
                testUser.id,
                balance - 100
            );

            expect(result).toBe(true);
        });

        it("should return false if insufficient balance", async () => {
            const balance = await walletService.getWalletBalance(testUser.id);
            const result = await walletService.validateSufficientBalance(
                testUser.id,
                balance + 100
            );

            expect(result).toBe(false);
        });
    });

    describe("getWalletTransactions", () => {
        it("should retrieve wallet transactions with pagination", async () => {
            const result = await walletService.getWalletTransactions(
                testUser.id,
                {},
                { page: 1, limit: 10 }
            );

            expect(result).toBeDefined();
            expect(result.transactions).toBeInstanceOf(Array);
            expect(result.transactions.length).toBeGreaterThan(0);
            expect(result.totalCount).toBeGreaterThan(0);
            expect(result.currentPage).toBe(1);
        });

        it("should filter transactions by type", async () => {
            const result = await walletService.getWalletTransactions(
                testUser.id,
                { type: "credit" },
                { page: 1, limit: 10 }
            );

            expect(result.transactions.every((t) => t.type === "credit")).toBe(true);
        });

        it("should filter transactions by reference type", async () => {
            const result = await walletService.getWalletTransactions(
                testUser.id,
                { referenceType: "recharge" },
                { page: 1, limit: 10 }
            );

            expect(result.transactions.every((t) => t.referenceType === "recharge")).toBe(true);
        });
    });

    describe("getWalletStats", () => {
        it("should return wallet statistics", async () => {
            const stats = await walletService.getWalletStats(testUser.id);

            expect(stats).toBeDefined();
            expect(stats.currentBalance).toBeGreaterThan(0);
            expect(stats.totalCredits).toBeGreaterThan(0);
            expect(stats.totalDebits).toBeGreaterThan(0);
            expect(stats.transactionCount).toBeGreaterThan(0);
            expect(stats.lastTransactionAt).toBeDefined();
        });
    });
});
