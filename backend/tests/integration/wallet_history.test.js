const request = require("supertest");
const app = require("../../src/app");
const { User, Wallet, WalletTransaction, CommunicationCharge, Ledger, Chat, sequelize } = require("../../src/models");
const jwt = require("jsonwebtoken");
const config = require("../../src/config");
const { Op } = require("sequelize");

describe("Wallet History API Integration Tests", () => {
    let userToken;
    let adminToken;
    let testUser;
    let testAdmin;
    let testWallet;

    beforeAll(async () => {
        try {
            // Cleanup existing data
            const emails = ["history_user@example.com", "history_admin@example.com"];
            const mobiles = ["7777777777", "6666666666"];

            const existingUsersByEmail = await User.findAll({ where: { email: emails } });
            const existingUsersByMobile = await User.findAll({ where: { mobileNumber: mobiles } });

            const allUserIds = [...new Set([...existingUsersByEmail, ...existingUsersByMobile].map(u => u.id))];

            for (const userId of allUserIds) {
                const wallet = await Wallet.findOne({ where: { userId } });
                if (wallet) {
                    const transactions = await WalletTransaction.findAll({ where: { walletId: wallet.id } });
                    const txIds = transactions.map(t => t.id);
                    await Ledger.destroy({ where: { walletTransactionId: txIds }, force: true });
                    await CommunicationCharge.destroy({ where: { walletTransactionId: txIds }, force: true });
                    await WalletTransaction.destroy({ where: { walletId: wallet.id }, force: true });
                    await Wallet.destroy({ where: { id: wallet.id }, force: true });
                }
                await User.destroy({ where: { id: userId }, force: true });
            }

            // Create test user
            testUser = await User.create({
                name: "History Test User",
                email: "history_user@example.com",
                mobileNumber: "7777777777",
                password: "password123",
                role: "user",
                isVerified: true,
                isActive: true,
            });

            testWallet = await Wallet.create({
                userId: testUser.id,
                balance: 100.0,
                currency: "INR",
            });

            // Create test admin
            testAdmin = await User.create({
                name: "History Test Admin",
                email: "history_admin@example.com",
                mobileNumber: "6666666666",
                password: "password123",
                role: "admin",
                isVerified: true,
                isActive: true,
            });

            // Create transactions
            await WalletTransaction.create({
                walletId: testWallet.id,
                type: "credit",
                amount: 50.0,
                balanceBefore: 50.0,
                balanceAfter: 100.0,
                referenceType: "recharge",
                referenceId: "00000000-0000-0000-0000-000000000001",
                description: "Test Recharge",
            });

            const convTx = await WalletTransaction.create({
                walletId: testWallet.id,
                type: "debit",
                amount: 20.0,
                balanceBefore: 120.0,
                balanceAfter: 100.0,
                referenceType: "conversation",
                referenceId: "00000000-0000-0000-0000-000000000123",
                description: "Test Chat",
            });

            await Chat.create({
                id: "00000000-0000-0000-0000-000000000123",
                participant1Id: testUser.id,
                participant2Id: testAdmin.id,
                serviceType: "chat",
                status: "ended",
            });

            await CommunicationCharge.create({
                conversationId: "00000000-0000-0000-0000-000000000123",
                userId: testUser.id,
                serviceType: "chat",
                durationSeconds: 125,
                pricePerMinute: 10.0,
                ratePerSecond: 0.166667,
                grossAmount: 20.0,
                commissionPercentage: 20.0,
                commissionAmount: 4.0,
                netEarning: 16.0,
                pricingSource: "global",
                walletTransactionId: convTx.id,
                chargedAt: new Date(),
            });

            userToken = jwt.sign({ id: testUser.id, role: testUser.role }, config.jwt.secret);
            adminToken = jwt.sign({ id: testAdmin.id, role: testAdmin.role }, config.jwt.secret);
        } catch (error) {
            console.error("SETUP ERROR:", error);
            throw error;
        }
    });

    afterAll(async () => {
        await sequelize.close();
    });

    describe("GET /api/transactions/wallet-history", () => {
        it("should allow a user to fetch their detailed wallet history", async () => {
            const response = await request(app)
                .get("/api/transactions/wallet-history")
                .set("Authorization", `Bearer ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.transactions).toBeInstanceOf(Array);

            const transactions = response.body.data.transactions;
            const convRecord = transactions.find(t => t.servicetype === "chat");
            expect(convRecord).toBeDefined();
            expect(convRecord.duration).toBe("02:05");
            expect(parseFloat(convRecord.commission)).toBe(4.0);

            const rechargeRecord = transactions.find(t => t.servicetype === "recharge");
            expect(rechargeRecord).toBeDefined();
        });

        it("should allow admin to access the wallet history", async () => {
            const response = await request(app)
                .get("/api/transactions/wallet-history")
                .set("Authorization", `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.transactions).toBeInstanceOf(Array);
        });
    });
});
