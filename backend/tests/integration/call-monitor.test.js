const { Chat, User, Wallet, sequelize } = require("../../src/models");
const callDurationMonitorService = require("../../src/services/callDurationMonitor.service");
const conversationService = require("../../src/services/conversation.service");
const redisService = require("../../src/services/redis.service");

describe("Call Duration Monitor Staleness & Recovery", () => {
    let payer;
    let earner;
    let chat;
    let mockIo;
    let inMemoryRedis = {};

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        
        payer = await User.create({ name: "Payer", role: "user", isBusy: false });
        earner = await User.create({ name: "Earner", role: "listener", isBusy: false });
        
        // Setup in-memory mock for redis
        jest.spyOn(redisService.client, 'hSet').mockImplementation(async (key, val) => {
            if (!inMemoryRedis[key]) inMemoryRedis[key] = {};
            // If val is an object, assign all keys
            if (typeof val === 'object') {
                Object.assign(inMemoryRedis[key], val);
            } else {
                // assume arguments might be (key, field, value)
                const field = arguments[1];
                const value = arguments[2];
                inMemoryRedis[key][field] = value;
            }
            return 1;
        });
        jest.spyOn(redisService.client, 'hGetAll').mockImplementation(async (key) => {
            return inMemoryRedis[key] || {};
        });
        jest.spyOn(redisService.client, 'del').mockImplementation(async (key) => {
            delete inMemoryRedis[key];
            return 1;
        });
        jest.spyOn(redisService.client, 'keys').mockImplementation(async (pattern) => {
            return Object.keys(inMemoryRedis).filter(k => k.startsWith('call-monitor:'));
        });
    });

    beforeEach(async () => {
        await Chat.destroy({ where: {} });
        chat = await Chat.create({
            participant1Id: payer.id,
            participant2Id: earner.id,
            status: "started",
            serviceType: "audio_call"
        });
        
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };
        
        // Use the actual test mock for Redis to test state changes
        const startState = {
            senderId: payer.id,
            receiverId: earner.id,
            conversationId: chat.id,
            serviceType: "audio_call",
            startTime: Date.now() - 10000,
            affordableSeconds: 60,
            warningsEmitted: JSON.stringify([])
        };
        await redisService.client.hSet(`call-monitor:${chat.id}`, startState);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        // Clear active monitors to prevent Jest hanging
        callDurationMonitorService.activeMonitors.forEach((monitor, key) => {
            clearInterval(monitor.intervalId);
        });
        callDurationMonitorService.activeMonitors.clear();
        // Clear redis mock state
        inMemoryRedis = {};
    });

    test("mid-call wallet top-up recalculates affordableSeconds and prevents premature cutoff", async () => {
        // Initial setup for the call monitor
        await callDurationMonitorService.startMonitoring(chat.id, chat.id, payer.id, earner.id, 60, mockIo, "audio_call");
        
        // Simulate a top-up by returning a higher affordableSeconds in the mid-call check
        jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockResolvedValue({
            affordableSeconds: 300, // Increased from 60 to 300
            hasSufficientBalance: true,
            pricingInfo: { pricing_id: 1, source: "mock" }
        });
        
        // Manipulate lastBalanceCheckAt to trigger the 5-second interval check
        await redisService.client.hSet(`call-monitor:${chat.id}`, {
            lastBalanceCheckAt: new Date(Date.now() - 6000).toISOString()
        });
        
        // Trigger the interval check manually
        await callDurationMonitorService._checkDuration(chat.id, mockIo);
        
        // Verify Redis was updated with the new affordableSeconds limit directly
        const updatedMonitorData = await redisService.client.hGetAll(`call-monitor:${chat.id}`);
        expect(Number(updatedMonitorData.affordableSeconds)).toBe(300);
    });

    test("boot-time reconciliation restores monitor from surviving Redis state", async () => {
        // Assume empty in-memory state on boot
        expect(callDurationMonitorService.activeMonitors[chat.id]).toBeUndefined();
        
        await callDurationMonitorService.recoverActiveSessions(mockIo);
        
        // Ensure the monitor interval was restored
        expect(callDurationMonitorService.activeMonitors.get(chat.id)).toBeDefined();
    });

    test("boot-time reconciliation force-ends call with reason 'system' if Redis state is missing (checks real DB state)", async () => {
        // Clear redis state entirely to simulate missing state
        await redisService.client.del(`call-monitor:${chat.id}`);
        jest.spyOn(callDurationMonitorService, 'stopMonitoring').mockResolvedValue();
        
        await callDurationMonitorService.recoverActiveSessions(mockIo);
        
        const updatedChat = await Chat.findByPk(chat.id);
        expect(updatedChat.status).toBe('ended');
        expect(updatedChat.endReason).toBe('system');
    });
});
