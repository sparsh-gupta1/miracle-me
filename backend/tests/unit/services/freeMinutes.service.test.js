const freeMinutesService = require("../../../src/services/freeMinutes.service");
const { FreeMinutesConfig, UserFreeMinutesUsage, User, sequelize } = require("../../../src/models");

describe("Free Minutes Service - Unified 1-Minute Shared Pool", () => {
    let testUser;
    let adminUser;

    beforeAll(async () => {
        adminUser = await User.create({
            name: "Admin User",
            email: `admin-${Date.now()}@example.com`,
            mobileNumber: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
            password: "password123",
            role: "admin",
            isVerified: true,
        });

        testUser = await User.create({
            name: "Test User",
            email: `user-${Date.now()}@example.com`,
            mobileNumber: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
            password: "password123",
            role: "user",
            isVerified: true,
        });
    });

    beforeEach(async () => {
        await UserFreeMinutesUsage.destroy({ where: { user_id: testUser.id } });
        await FreeMinutesConfig.destroy({ where: {} });
        await FreeMinutesConfig.create({
            service_type: "chat",
            free_minutes: 1,
            is_active: true,
            created_by: adminUser.id,
        });
    });

    afterAll(async () => {
        await UserFreeMinutesUsage.destroy({ where: {} });
        await FreeMinutesConfig.destroy({ where: {} });
        await User.destroy({ where: { id: [testUser.id, adminUser.id] } });
        await sequelize.close();
    });

    describe("Shared 1-Minute Free Time Across Services", () => {
        it("should initialize default 1-minute (60s) free pool for user", async () => {
            const chatUsage = await freeMinutesService.getUserFreeMinutesUsage(testUser.id, "chat");

            expect(chatUsage).toBeDefined();
            expect(chatUsage.total_free_seconds).toBe(60);
            expect(chatUsage.remaining_seconds).toBe(60);
        });

        it("should deduct from shared pool when consuming free time in one service and reflect in others", async () => {
            // Step 1: User chats for 40 seconds
            const t1 = await sequelize.transaction();
            const res1 = await freeMinutesService.consumeFreeMinutes(testUser.id, "chat", 40, t1);
            await t1.commit();

            expect(res1.consumedFreeSeconds).toBe(40);
            expect(res1.remainingFreeSeconds).toBe(20);
            expect(res1.billableSeconds).toBe(0);

            // Step 2: Check audio_call and video_call usage - should both show 20s remaining
            const audioUsage = await freeMinutesService.getUserFreeMinutesUsage(testUser.id, "audio_call");
            const videoUsage = await freeMinutesService.getUserFreeMinutesUsage(testUser.id, "video_call");

            expect(audioUsage.remaining_seconds).toBe(20);
            expect(videoUsage.remaining_seconds).toBe(20);

            // Step 3: User makes Audio Call for 30 seconds
            const t2 = await sequelize.transaction();
            const res2 = await freeMinutesService.consumeFreeMinutes(testUser.id, "audio_call", 30, t2);
            await t2.commit();

            expect(res2.consumedFreeSeconds).toBe(20); // Only 20s left in shared pool
            expect(res2.remainingFreeSeconds).toBe(0);
            expect(res2.billableSeconds).toBe(10); // 10s billed to wallet

            // Step 4: User attempts Video Call for 60 seconds - pool is exhausted (0 free)
            const t3 = await sequelize.transaction();
            const res3 = await freeMinutesService.consumeFreeMinutes(testUser.id, "video_call", 60, t3);
            await t3.commit();

            expect(res3.consumedFreeSeconds).toBe(0);
            expect(res3.remainingFreeSeconds).toBe(0);
            expect(res3.billableSeconds).toBe(60);
        });

        it("should correctly report all user free minutes usage showing shared remaining seconds", async () => {
            // Consume 30s in chat
            const t = await sequelize.transaction();
            await freeMinutesService.consumeFreeMinutes(testUser.id, "chat", 30, t);
            await t.commit();

            const allUsage = await freeMinutesService.getAllUserFreeMinutesUsage(testUser.id);

            expect(allUsage.length).toBeGreaterThan(0);
            allUsage.forEach((u) => {
                expect(u.totalFreeSeconds).toBe(60);
                expect(u.remainingSeconds).toBe(30);
            });
        });

        it("should allow admin to configure global free minutes and update user pool", async () => {
            await freeMinutesService.setFreeMinutesConfig("chat", 2, adminUser.id); // Set to 2 minutes (120s)

            const chatUsage = await freeMinutesService.getUserFreeMinutesUsage(testUser.id, "chat");
            expect(chatUsage.total_free_seconds).toBe(120);
            expect(chatUsage.remaining_seconds).toBe(120);
        });
    });
});
