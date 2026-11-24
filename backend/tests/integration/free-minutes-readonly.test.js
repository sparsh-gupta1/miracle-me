const { User, UserFreeMinutesUsage, FreeMinutesConfig, sequelize } = require("../../src/models");
const conversationService = require("../../src/services/conversation.service");
const freeMinutesService = require("../../src/services/freeMinutes.service");
const walletService = require("../../src/services/wallet.service");
const pricingService = require("../../src/services/pricing.service");

describe("Free Minutes Read-Only Monitor Fix", () => {
    let mockUser, mockEarner;

    beforeAll(async () => {
        const dbName = sequelize.config.database;
        if (dbName !== 'mirecleme_test') {
            console.error(`DB_NAME is ${dbName}, expected mirecleme_test`);
            process.exit(1);
        }
        console.log(`DB_NAME: ${dbName}`);

        mockUser = await User.create({ name: "Payer", role: "user", phone: "+1112223334" });
        mockEarner = await User.create({ name: "Earner", role: "listener", phone: "+1112223335" });

        await FreeMinutesConfig.findOrCreate({
            where: { service_type: "audio_call" },
            defaults: {
                free_minutes: 5,
                is_active: true,
                created_by: mockUser.id,
            }
        });
        
        jest.spyOn(walletService, "getWalletBalance").mockResolvedValue(100);
        jest.spyOn(pricingService, "getEffectivePricing").mockResolvedValue({ pricePerMinute: 10, source: "default", pricing_id: 1 });
    });

    afterAll(async () => {
        await UserFreeMinutesUsage.destroy({ where: {} });
        await FreeMinutesConfig.destroy({ where: {} });
        await User.destroy({ where: {} });
        jest.restoreAllMocks();
    });

    beforeEach(async () => {
        await UserFreeMinutesUsage.destroy({ where: {} });
    });

    it("calling validateBalanceAndCalculateDuration with readOnly does not update usage row updated_at", async () => {
        // First call without readOnly to initialize usage row
        const resultOriginal = await conversationService.validateBalanceAndCalculateDuration(mockUser.id, mockEarner.id, "audio_call");
        
        const usageAfterInit = await UserFreeMinutesUsage.findOne({ where: { user_id: mockUser.id, service_type: "audio_call" } });
        expect(usageAfterInit).not.toBeNull();
        
        const initialUpdatedAt = usageAfterInit.updatedAt.getTime();

        // Wait a bit to ensure time would change if updated
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Call 5 times with readOnly
        let lastResult = null;
        for (let i = 0; i < 5; i++) {
            lastResult = await conversationService.validateBalanceAndCalculateDuration(mockUser.id, mockEarner.id, "audio_call", { readOnly: true });
            
            // Assert result equals the old calculation (same as original)
            expect(lastResult.freeSecondsRemaining).toEqual(resultOriginal.freeSecondsRemaining);
            expect(lastResult.affordableSeconds).toEqual(resultOriginal.affordableSeconds);
        }

        const usageAfter5Calls = await UserFreeMinutesUsage.findOne({ where: { user_id: mockUser.id, service_type: "audio_call" } });
        
        // Assert updated_at hasn't changed
        expect(usageAfter5Calls.updatedAt.getTime()).toEqual(initialUpdatedAt);
    });
});
