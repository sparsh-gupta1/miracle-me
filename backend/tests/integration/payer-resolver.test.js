const { Chat, User } = require("../../src/models");
const conversationService = require("../../src/services/conversation.service");
const chatSessionService = require("../../src/services/chatSession.service");
const callDurationMonitor = require("../../src/services/callDurationMonitor.service");
const redisService = require("../../src/services/redis.service");
const logger = require("../../src/utils/logger");

describe("Payer Resolver Logic", () => {
    let mockUser1, mockUser2, mockListener1, mockListener2;
    beforeAll(async () => {
        mockUser1 = await User.create({ name: "U1", role: "user", phone: "+1234567891" });
        mockUser2 = await User.create({ name: "U2", role: "user", phone: "+1234567892" });
        mockListener1 = await User.create({ name: "L1", role: "listener", phone: "+1234567893" });
        mockListener2 = await User.create({ name: "L2", role: "listener", phone: "+1234567894" });
    });

    afterAll(async () => {
        await User.destroy({ where: {} });
    });

    beforeEach(async () => {
        await Chat.destroy({ where: {} });
        jest.clearAllMocks();
    });

    describe("resolvePayerEarner helper", () => {
        it("payer as participant1", () => {
            const result = conversationService.resolvePayerEarner({
                participant1: mockUser1,
                participant2: mockListener1
            });
            expect(result).toEqual({ payerId: mockUser1.id, earnerId: mockListener1.id });
        });

        it("payer as participant2 (listener first)", () => {
            const result = conversationService.resolvePayerEarner({
                participant1: mockListener1,
                participant2: mockUser1
            });
            expect(result).toEqual({ payerId: mockUser1.id, earnerId: mockListener1.id });
        });

        it("two users (skipped and logged)", () => {
            const result = conversationService.resolvePayerEarner({
                participant1: mockUser1,
                participant2: mockUser2
            });
            expect(result).toBeNull();
        });

        it("two listeners (skipped and logged)", () => {
            const result = conversationService.resolvePayerEarner({
                participant1: mockListener1,
                participant2: mockListener2
            });
            expect(result).toBeNull();
        });
    });

    describe("chatSession.checkActiveSessionBalances integration", () => {
        it("skips and logs error for two users", async () => {
            await Chat.create({
                participant1Id: mockUser1.id,
                participant2Id: mockUser2.id,
                status: "started",
                serviceType: "chat",
                connectedAt: new Date()
            });

            jest.spyOn(redisService, "getChatSessionPayerId").mockResolvedValue(null);
            jest.spyOn(logger, "error");
            jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockImplementation();

            await chatSessionService.checkActiveSessionBalances({});

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining("Cannot determine payer")
            );
            expect(conversationService.validateBalanceAndCalculateDuration).not.toHaveBeenCalled();
        });
    });

    describe("callDurationMonitor.recoverActiveSessions integration", () => {
        it("skips and logs error for two users", async () => {
            await Chat.create({
                participant1Id: mockUser1.id,
                participant2Id: mockUser2.id,
                status: "started",
                serviceType: "audio_call"
            });

            jest.spyOn(logger, "error");
            jest.spyOn(conversationService, "endConversation").mockImplementation();

            await callDurationMonitor.recoverActiveSessions({});

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining("Cannot determine payer")
            );
            expect(conversationService.endConversation).not.toHaveBeenCalled();
        });
    });
});
