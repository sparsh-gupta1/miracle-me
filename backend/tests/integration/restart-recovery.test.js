const { Chat, User } = require("../../src/models");
const callDurationMonitor = require("../../src/services/callDurationMonitor.service");
const conversationService = require("../../src/services/conversation.service");
const redisService = require("../../src/services/redis.service");
const { v4: uuidv4 } = require("uuid");

describe("Restart Recovery", () => {
    let mockUser, mockListener;
    let io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    beforeAll(async () => {
        mockUser = await User.create({ name: "U1", role: "user", phone: "+1234567891" });
        mockListener = await User.create({ name: "L1", role: "listener", phone: "+1234567893" });
    });

    afterAll(async () => {
        await User.destroy({ where: {} });
    });

    beforeEach(async () => {
        await Chat.destroy({ where: {} });
        callDurationMonitor.activeMonitors.clear();
        jest.clearAllMocks();
        
        // Mock set for lock
        redisService.client.set.mockResolvedValue("OK");
    });

    it("SCAN finds the keys", async () => {
        const mockUser2 = await User.create({ name: "U2", role: "user", phone: "+1234567895" });
        const chat1 = await Chat.create({ participant1Id: mockUser.id, participant2Id: mockListener.id, status: "started", serviceType: "audio_call" });
        const chat2 = await Chat.create({ participant1Id: mockUser2.id, participant2Id: mockListener.id, status: "started", serviceType: "audio_call" });
        
        const callId1 = uuidv4();
        const callId2 = uuidv4();

        redisService.client.scan = jest.fn().mockResolvedValue({ cursor: 0, keys: [`call-monitor:${callId1}`, `call-monitor:${callId2}`] });
        redisService.client.hGetAll = jest.fn().mockImplementation((key) => {
            if (key === `call-monitor:${callId1}`) return { conversationId: chat1.id, status: "monitoring", senderId: mockUser.id, receiverId: mockListener.id };
            if (key === `call-monitor:${callId2}`) return { conversationId: chat2.id, status: "monitoring", senderId: mockUser.id, receiverId: mockListener.id };
            return null;
        });

        await callDurationMonitor.recoverActiveSessions(io);

        expect(callDurationMonitor.activeMonitors.has(callId1)).toBe(true);
        expect(callDurationMonitor.activeMonitors.has(callId2)).toBe(true);
        expect(redisService.client.scan).toHaveBeenCalled();
        
        await callDurationMonitor.stopMonitoring(callId1);
        await callDurationMonitor.stopMonitoring(callId2);
    });

    it("a second recovery call is a no-op", async () => {
        const chat = await Chat.create({ participant1Id: mockUser.id, participant2Id: mockListener.id, status: "started", serviceType: "audio_call" });
        const callId = uuidv4();
        
        redisService.client.scan = jest.fn().mockResolvedValue({ cursor: 0, keys: [`call-monitor:${callId}`] });
        redisService.client.hGetAll = jest.fn().mockResolvedValue({ conversationId: chat.id, status: "monitoring", senderId: mockUser.id, receiverId: mockListener.id });

        // Simulate lock failure
        redisService.client.set.mockResolvedValue(null);

        await callDurationMonitor.recoverActiveSessions(io);
        
        expect(callDurationMonitor.activeMonitors.has(callId)).toBe(false);

        // Allow lock again to test skipping already monitored
        redisService.client.set.mockResolvedValue("OK");
        callDurationMonitor.activeMonitors.set(callId, { intervalId: "mock", conversationId: chat.id });
        
        await callDurationMonitor.recoverActiveSessions(io);
        
        // Ensure hGetAll was not called for the existing monitor (ending the conversation may
        // still read its own `call:<conversationId>` mirror to clean it up)
        expect(redisService.client.hGetAll).not.toHaveBeenCalledWith(`call-monitor:${callId}`);
    });

    it("expired key + payer as participant2 bills the right user", async () => {
        const chat = await Chat.create({ participant1Id: mockListener.id, participant2Id: mockUser.id, status: "started", serviceType: "audio_call" });
        
        // SCAN returns empty, simulating expired keys
        redisService.client.scan = jest.fn().mockResolvedValue({ cursor: 0, keys: [] });
        
        const endConversationSpy = jest.spyOn(conversationService, "endConversation").mockResolvedValue({});

        await callDurationMonitor.recoverActiveSessions(io);

        expect(endConversationSpy).toHaveBeenCalledWith(
            chat.id,
            expect.objectContaining({ payerId: mockUser.id })
        );
    });
});
