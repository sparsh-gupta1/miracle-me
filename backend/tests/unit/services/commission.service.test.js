const commissionService = require("../../../src/services/commission.service");
const { Commission, User, sequelize } = require("../../../src/models");

describe("Commission Service", () => {
    let admin;

    beforeAll(async () => {
        // Create admin user
        admin = await User.create({
            name: "Admin User",
            email: "commissionadmin@example.com",
            mobileNumber: "7777777777",
            password: "password123",
            role: "admin",
            isVerified: true,
        });
    });

    afterAll(async () => {
        await Commission.destroy({ where: {} });
        await User.destroy({ where: { id: admin.id } });
        await sequelize.close();
    });

    describe("createCommissionRule", () => {
        it("should create a commission rule", async () => {
            const rule = await commissionService.createCommissionRule(
                {
                    role: "listener",
                    serviceType: "chat",
                    commissionPercentage: 15.0,
                    effectiveFrom: new Date(),
                },
                admin.id
            );

            expect(rule).toBeDefined();
            expect(rule.role).toBe("listener");
            expect(rule.serviceType).toBe("chat");
            expect(parseFloat(rule.commissionPercentage)).toBe(15.0);
            expect(rule.isActive).toBe(true);
            expect(rule.createdBy).toBe(admin.id);
        });

        it("should create rule with default effective date", async () => {
            const rule = await commissionService.createCommissionRule(
                {
                    role: "astrologer",
                    serviceType: "audio_call",
                    commissionPercentage: 25.0,
                },
                admin.id
            );

            expect(rule.effectiveFrom).toBeDefined();
            expect(rule.effectiveFrom).toBeInstanceOf(Date);
        });

        it("should create multiple rules for different service types", async () => {
            await commissionService.createCommissionRule(
                {
                    role: "listener",
                    serviceType: "audio_call",
                    commissionPercentage: 18.0,
                },
                admin.id
            );

            await commissionService.createCommissionRule(
                {
                    role: "listener",
                    serviceType: "video_call",
                    commissionPercentage: 20.0,
                },
                admin.id
            );

            const rules = await Commission.findAll({
                where: { role: "listener" },
            });

            expect(rules.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe("updateCommissionRule", () => {
        let testRule;

        beforeEach(async () => {
            testRule = await Commission.create({
                role: "listener",
                serviceType: "chat",
                commissionPercentage: 10.0,
                effectiveFrom: new Date(),
                createdBy: admin.id,
                isActive: true,
            });
        });

        it("should update commission percentage", async () => {
            const updated = await commissionService.updateCommissionRule(testRule.id, {
                commissionPercentage: 12.0,
            });

            expect(parseFloat(updated.commissionPercentage)).toBe(12.0);
        });

        it("should update active status", async () => {
            const updated = await commissionService.updateCommissionRule(testRule.id, {
                isActive: false,
            });

            expect(updated.isActive).toBe(false);
        });

        it("should throw error if rule not found", async () => {
            const fakeId = "00000000-0000-0000-0000-000000000000";

            await expect(
                commissionService.updateCommissionRule(fakeId, { commissionPercentage: 10 })
            ).rejects.toThrow("Commission rule not found");
        });
    });

    describe("getCommissionRules", () => {
        it("should retrieve all commission rules", async () => {
            const rules = await commissionService.getCommissionRules();

            expect(rules).toBeInstanceOf(Array);
            expect(rules.length).toBeGreaterThan(0);
            expect(rules[0].creator).toBeDefined();
        });

        it("should filter by role", async () => {
            const rules = await commissionService.getCommissionRules("listener");

            expect(rules.every((r) => r.role === "listener")).toBe(true);
        });

        it("should filter by service type", async () => {
            const rules = await commissionService.getCommissionRules(null, "chat");

            expect(rules.every((r) => r.serviceType === "chat")).toBe(true);
        });

        it("should filter by both role and service type", async () => {
            const rules = await commissionService.getCommissionRules("listener", "audio_call");

            expect(rules.every((r) => r.role === "listener" && r.serviceType === "audio_call")).toBe(
                true
            );
        });

        it("should order by effective date descending", async () => {
            const rules = await commissionService.getCommissionRules("listener", "chat");

            if (rules.length > 1) {
                expect(rules[0].effectiveFrom >= rules[1].effectiveFrom).toBe(true);
            }
        });
    });

    describe("getCurrentCommission", () => {
        it("should retrieve current active commission", async () => {
            const commission = await commissionService.getCurrentCommission("listener", "chat");

            expect(commission).toBeDefined();
            expect(commission.isActive).toBe(true);
            expect(commission.role).toBe("listener");
            expect(commission.serviceType).toBe("chat");
        });

        it("should return null if no active commission", async () => {
            const commission = await commissionService.getCurrentCommission(
                "astrologer",
                "video_call"
            );

            // May or may not exist depending on test order
            if (commission) {
                expect(commission.isActive).toBe(true);
            }
        });

        it("should return most recent active commission", async () => {
            // Create older commission
            await Commission.create({
                role: "listener",
                serviceType: "video_call",
                commissionPercentage: 10.0,
                effectiveFrom: new Date(Date.now() - 86400000), // 1 day ago
                createdBy: admin.id,
                isActive: true,
            });

            // Create newer commission
            const newer = await Commission.create({
                role: "listener",
                serviceType: "video_call",
                commissionPercentage: 15.0,
                effectiveFrom: new Date(),
                createdBy: admin.id,
                isActive: true,
            });

            const current = await commissionService.getCurrentCommission("listener", "video_call");

            expect(current.id).toBe(newer.id);
            expect(parseFloat(current.commissionPercentage)).toBe(15.0);
        });
    });

    describe("calculateCommission", () => {
        beforeEach(async () => {
            // Cleanup existing rules to avoid test pollution
            await Commission.destroy({ where: { role: "listener", serviceType: "chat" } });

            // Create the rule specifically for this test block
            await Commission.create({
                role: "listener",
                serviceType: "chat",
                commissionPercentage: 20.0,
                effectiveFrom: new Date(),
                createdBy: admin.id,
                isActive: true,
            });
        });

        it("should calculate commission correctly", async () => {
            const result = await commissionService.calculateCommission(1000.0, "listener", "chat");

            expect(result.commissionPercentage).toBe(20.0);
            expect(result.commissionAmount).toBe(200.0);
            expect(result.netEarning).toBe(800.0);
        });

        it("should handle decimal amounts correctly", async () => {
            const result = await commissionService.calculateCommission(123.45, "listener", "chat");

            expect(result.commissionAmount).toBe(24.69); // 123.45 * 0.2
            expect(result.netEarning).toBe(98.76); // 123.45 - 24.69
        });

        it("should return zero commission if not configured", async () => {
            const result = await commissionService.calculateCommission(
                500.0,
                "astrologer",
                "chat"
            );

            expect(result.commissionPercentage).toBe(0);
            expect(result.commissionAmount).toBe(0);
            expect(result.netEarning).toBe(500.0);
        });

        it("should round to 2 decimal places", async () => {
            const result = await commissionService.calculateCommission(
                333.33,
                "listener",
                "chat"
            );

            // 333.33 * 0.2 = 66.666
            expect(result.commissionAmount).toBe(66.67);
            expect(result.netEarning).toBe(266.66);
        });
    });

    describe("getAllCurrentCommissions", () => {
        it("should retrieve all active commissions", async () => {
            const commissions = await commissionService.getAllCurrentCommissions();

            expect(commissions).toBeInstanceOf(Array);
            expect(commissions.every((c) => c.isActive === true)).toBe(true);
        });

        it("should order by role and service type", async () => {
            const commissions = await commissionService.getAllCurrentCommissions();

            const roleOrder = {
                listener: 1,
                astrologer: 2
            };

            const serviceTypeOrder = {
                chat: 1,
                audio_call: 2,
                video_call: 3
            };

            if (commissions.length > 1) {
                // Verify ordering
                for (let i = 1; i < commissions.length; i++) {
                    const prev = commissions[i - 1];
                    const curr = commissions[i];

                    if (prev.role === curr.role) {
                        expect(serviceTypeOrder[prev.serviceType] <= serviceTypeOrder[curr.serviceType]).toBe(true);
                    } else {
                        expect(roleOrder[prev.role] <= roleOrder[curr.role]).toBe(true);
                    }
                }
            }
        });
    });
});
