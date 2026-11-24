const withdrawalService = require("../../../src/services/withdrawal.service");
const walletService = require("../../../src/services/wallet.service");
const {
    WithdrawalRule,
    WithdrawalRequest,
    User,
    sequelize,
} = require("../../../src/models");

describe("Withdrawal Service", () => {
    let admin;
    let testUser;
    let withdrawalRule;

    beforeAll(async () => {
        // Create admin user
        admin = await User.create({
            name: "Admin User",
            email: "admin@example.com",
            mobileNumber: "5555555555",
            password: "password123",
            role: "admin",
            isVerified: true,
        });

        // Create test user
        testUser = await User.create({
            name: "Test User",
            email: "testuser@example.com",
            mobileNumber: "6666666666",
            password: "password123",
            role: "listener",
            isVerified: true,
        });

        // Create wallet and add balance
        await walletService.createWallet(testUser.id, "earning");
        await walletService.creditWallet(
            testUser.id,
            10000.0,
            "recharge",
            "test-recharge-withdrawal",
            "Test recharge for withdrawal",
            {},
            null,
            "earning"
        );
    });

    afterAll(async () => {
        await WithdrawalRequest.destroy({ where: {} });
        await WithdrawalRule.destroy({ where: {} });
        await User.destroy({ where: { id: [admin.id, testUser.id] } });
        await sequelize.close();
    });

    describe("createWithdrawalRule", () => {
        it("should create a withdrawal rule", async () => {
            const rule = await withdrawalService.createWithdrawalRule(
                {
                    minAmount: 500.0,
                    allowedDays: [1, 2, 3, 4, 5], // Monday to Friday
                    effectiveFrom: new Date(),
                },
                admin.id
            );

            expect(rule).toBeDefined();
            expect(parseFloat(rule.minAmount)).toBe(500.0);
            expect(rule.allowedDays).toEqual([1, 2, 3, 4, 5]);
            expect(rule.isActive).toBe(true);
            expect(rule.createdBy).toBe(admin.id);

            withdrawalRule = rule;
        });
    });

    describe("updateWithdrawalRule", () => {
        it("should update withdrawal rule", async () => {
            const updated = await withdrawalService.updateWithdrawalRule(withdrawalRule.id, {
                minAmount: 1000.0,
            });

            expect(parseFloat(updated.minAmount)).toBe(1000.0);
        });

        it("should throw error if rule not found", async () => {
            const fakeId = "00000000-0000-0000-0000-000000000000";

            await expect(
                withdrawalService.updateWithdrawalRule(fakeId, { minAmount: 500 })
            ).rejects.toThrow("Withdrawal rule not found");
        });
    });

    describe("getCurrentWithdrawalRule", () => {
        it("should retrieve current active rule", async () => {
            const rule = await withdrawalService.getCurrentWithdrawalRule();

            expect(rule).toBeDefined();
            expect(rule.isActive).toBe(true);
            expect(rule.id).toBe(withdrawalRule.id);
        });
    });

    describe("getAllWithdrawalRules", () => {
        it("should retrieve all withdrawal rules", async () => {
            const rules = await withdrawalService.getAllWithdrawalRules();

            expect(rules).toBeInstanceOf(Array);
            expect(rules.length).toBeGreaterThan(0);
            expect(rules[0].creator).toBeDefined();
        });
    });

    describe("validateWithdrawalRequest", () => {
        it("should validate valid withdrawal request", async () => {
            // Update rule to allow today
            const today = new Date().getDay();
            await withdrawalRule.update({ allowedDays: [today] });

            const validation = await withdrawalService.validateWithdrawalRequest(
                testUser.id,
                2000.0
            );

            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
            expect(validation.rule).toBeDefined();
        });

        it("should reject if amount below minimum", async () => {
            const validation = await withdrawalService.validateWithdrawalRequest(
                testUser.id,
                500.0
            );

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain("Minimum withdrawal amount is 1000");
        });

        it("should reject if insufficient balance", async () => {
            const balance = await walletService.getWalletBalance(testUser.id, "earning");

            const validation = await withdrawalService.validateWithdrawalRequest(
                testUser.id,
                balance + 1000.0
            );

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain("Insufficient earning wallet balance");
        });

        it("should reject if day not allowed", async () => {
            // Set allowed days to exclude today
            const today = new Date().getDay();
            const otherDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today);
            await withdrawalRule.update({ allowedDays: otherDays });

            const validation = await withdrawalService.validateWithdrawalRequest(
                testUser.id,
                2000.0
            );

            expect(validation.isValid).toBe(false);
            expect(validation.errors.some((e) => e.includes("only allowed on"))).toBe(true);

            // Reset for other tests
            await withdrawalRule.update({ allowedDays: [today] });
        });

        it("should reject if pending request exists", async () => {
            // Create pending request
            const request = await WithdrawalRequest.create({
                userId: testUser.id,
                amount: 1500.0,
                status: "pending",
            });

            const validation = await withdrawalService.validateWithdrawalRequest(
                testUser.id,
                2000.0
            );

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain("You already have a pending withdrawal request");

            // Cleanup
            await request.destroy();
        });
    });

    describe("createWithdrawalRequest", () => {
        it("should create withdrawal request", async () => {
            const request = await withdrawalService.createWithdrawalRequest(
                testUser.id,
                2000.0
            );

            expect(request).toBeDefined();
            expect(parseFloat(request.amount)).toBe(2000.0);
            expect(request.status).toBe("pending");
            expect(request.userId).toBe(testUser.id);
        });

        it("should throw error if validation fails", async () => {
            await expect(
                withdrawalService.createWithdrawalRequest(testUser.id, 100.0)
            ).rejects.toThrow();
        });
    });

    describe("approveWithdrawal", () => {
        let pendingRequest;

        beforeEach(async () => {
            // Clear existing requests
            await WithdrawalRequest.destroy({ where: { userId: testUser.id } });

            pendingRequest = await WithdrawalRequest.create({
                userId: testUser.id,
                amount: 1500.0,
                status: "pending",
            });
        });

        it("should approve withdrawal and debit wallet", async () => {
            const balanceBefore = await walletService.getWalletBalance(testUser.id, "earning");

            const result = await withdrawalService.approveWithdrawal(
                pendingRequest.id,
                admin.id
            );

            expect(result.request.status).toBe("approved");
            expect(result.request.processedBy).toBe(admin.id);
            expect(result.request.processedAt).toBeDefined();
            expect(result.walletTransaction).toBeDefined();

            const balanceAfter = await walletService.getWalletBalance(testUser.id, "earning");
            expect(balanceAfter).toBe(balanceBefore - 1500.0);
        });

        it("should throw error if request not found", async () => {
            const fakeId = "00000000-0000-0000-0000-000000000000";

            await expect(
                withdrawalService.approveWithdrawal(fakeId, admin.id)
            ).rejects.toThrow("Withdrawal request not found");
        });

        it("should throw error if request already processed", async () => {
            await pendingRequest.update({ status: "approved" });

            await expect(
                withdrawalService.approveWithdrawal(pendingRequest.id, admin.id)
            ).rejects.toThrow("Withdrawal request is already approved");
        });

        it("should throw error if insufficient balance", async () => {
            const balance = await walletService.getWalletBalance(testUser.id, "earning");

            const largeRequest = await WithdrawalRequest.create({
                userId: testUser.id,
                amount: balance + 1000.0,
                status: "pending",
            });

            const result = await withdrawalService.approveWithdrawal(largeRequest.id, admin.id);
            expect(result.rejected).toBe(true);
            expect(result.reason).toBe("Insufficient balance at time of approval");
        });
    });

    describe("rejectWithdrawal", () => {
        let pendingRequest;

        beforeEach(async () => {
            await WithdrawalRequest.destroy({ where: { userId: testUser.id } });

            pendingRequest = await WithdrawalRequest.create({
                userId: testUser.id,
                amount: 1000.0,
                status: "pending",
            });
        });

        it("should reject withdrawal request", async () => {
            const balanceBefore = await walletService.getWalletBalance(testUser.id, "earning");

            const result = await withdrawalService.rejectWithdrawal(
                pendingRequest.id,
                admin.id,
                "Insufficient documentation"
            );

            expect(result.status).toBe("rejected");
            expect(result.processedBy).toBe(admin.id);
            expect(result.rejectionReason).toBe("Insufficient documentation");
            expect(result.processedAt).toBeDefined();

            // Balance should remain unchanged
            const balanceAfter = await walletService.getWalletBalance(testUser.id, "earning");
            expect(balanceAfter).toBe(balanceBefore);
        });

        it("should throw error if request not found", async () => {
            const fakeId = "00000000-0000-0000-0000-000000000000";

            await expect(
                withdrawalService.rejectWithdrawal(fakeId, admin.id, "Test reason")
            ).rejects.toThrow("Withdrawal request not found");
        });

        it("should throw error if request already processed", async () => {
            await pendingRequest.update({ status: "rejected" });

            await expect(
                withdrawalService.rejectWithdrawal(pendingRequest.id, admin.id, "Test")
            ).rejects.toThrow("Withdrawal request is already rejected");
        });
    });

    describe("getUserWithdrawals", () => {
        it("should retrieve user withdrawals with pagination", async () => {
            const result = await withdrawalService.getUserWithdrawals(
                testUser.id,
                {},
                { page: 1, limit: 10 }
            );

            expect(result).toBeDefined();
            expect(result.requests).toBeInstanceOf(Array);
            expect(result.totalCount).toBeGreaterThan(0);
        });

        it("should filter by status", async () => {
            const result = await withdrawalService.getUserWithdrawals(
                testUser.id,
                { status: "rejected" },
                { page: 1, limit: 10 }
            );

            expect(result.requests.every((r) => r.status === "rejected")).toBe(true);
        });
    });

    describe("getPendingWithdrawals", () => {
        it("should retrieve pending withdrawals for admin", async () => {
            const result = await withdrawalService.getPendingWithdrawals({ page: 1, limit: 10 });

            expect(result).toBeDefined();
            expect(result.requests).toBeInstanceOf(Array);
        });
    });

    describe("getWithdrawalStats", () => {
        it("should return withdrawal statistics", async () => {
            const stats = await withdrawalService.getWithdrawalStats(testUser.id);

            expect(stats).toBeDefined();
            expect(stats.totalRequests).toBeGreaterThan(0);
            expect(stats.approvedRequests).toBeGreaterThanOrEqual(0);
            expect(stats.rejectedRequests).toBeGreaterThanOrEqual(0);
            expect(stats.pendingRequests).toBeGreaterThanOrEqual(0);
            expect(stats.totalWithdrawn).toBeGreaterThanOrEqual(0);
        });
    });
});
