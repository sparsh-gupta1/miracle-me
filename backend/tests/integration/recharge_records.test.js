const request = require("supertest");
const app = require("../../src/app");
const { User, Wallet, WalletTransaction, Ledger, sequelize } = require("../../src/models");
const jwt = require("jsonwebtoken");
const config = require("../../src/config");

describe("Recharge Records API Integration Tests", () => {
    let userToken;
    let adminToken;
    let testUser;
    let testAdmin;
    let testWallet;

    beforeAll(async () => {
        try {
            // Cleanup existing test data if any
            const existingUsers = await User.findAll({
                where: { email: ["recharge_user@example.com", "recharge_admin@example.com"] },
                include: [{ model: Wallet, as: "wallet" }]
            });

            for (const user of existingUsers) {
                if (user.wallet) {
                    const wt = await WalletTransaction.findAll({ where: { walletId: user.wallet.id } });
                    const wtIds = wt.map(t => t.id);
                    await Ledger.destroy({ where: { walletTransactionId: wtIds }, force: true });
                    await WalletTransaction.destroy({ where: { walletId: user.wallet.id }, force: true });
                    await Wallet.destroy({ where: { id: user.wallet.id }, force: true });
                }
                await User.destroy({ where: { id: user.id }, force: true });
            }

            // Create test user
            testUser = await User.create({
                name: "Recharge Test User",
                email: "recharge_user@example.com",
                mobileNumber: "9999999999",
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
                name: "Recharge Test Admin",
                email: "recharge_admin@example.com",
                mobileNumber: "8888888888",
                password: "password123",
                role: "admin",
                isVerified: true,
                isActive: true,
            });

            // Create wallet transactions
            await WalletTransaction.create({
                walletId: testWallet.id,
                type: "credit",
                amount: 50.0,
                balanceBefore: 50.0,
                balanceAfter: 100.0,
                referenceType: "recharge",
                referenceId: "00000000-0000-0000-0000-000000000001",
                description: "Test Recharge 1",
            });

            // Generate tokens
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

    describe("GET /api/transactions/recharge-records", () => {
        it("should allow a regular user to fetch their recharge records", async () => {
            const response = await request(app)
                .get("/api/transactions/recharge-records")
                .set("Authorization", `Bearer ${userToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.transactions).toBeInstanceOf(Array);

            const transactions = response.body.data.transactions;
            expect(transactions.length).toBeGreaterThan(0);
            expect(transactions[0].referenceType).toBe("recharge");
            expect(parseFloat(transactions[0].balanceBefore)).toBeDefined();
            expect(parseFloat(transactions[0].balanceAfter)).toBeDefined();
        });

        it("should restrict admin from accessing the recharge records endpoint", async () => {
            const response = await request(app)
                .get("/api/transactions/recharge-records")
                .set("Authorization", `Bearer ${adminToken}`);

            expect(response.status).toBe(403);
        });
    });
});
