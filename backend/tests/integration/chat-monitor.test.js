const { Chat, User, Wallet, sequelize } = require("../../src/models");
const chatSessionService = require("../../src/services/chatSession.service");
const conversationService = require("../../src/services/conversation.service");
const redisService = require("../../src/services/redis.service");

describe("Chat Session Active Balance Monitor", () => {
    let payer;
    let earner;
    let chat;
    let mockIo;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        
        payer = await User.create({ name: "Payer", role: "user", isBusy: false });
        earner = await User.create({ name: "Earner", role: "listener", isBusy: false });
        await Wallet.create({ userId: payer.id, balance: 10, type: "main" });
        await Wallet.create({ userId: earner.id, balance: 0, type: "earning" });
    });

    beforeEach(async () => {
        await Chat.destroy({ where: {} });
        chat = await Chat.create({
            participant1Id: payer.id,
            participant2Id: earner.id,
            status: "started",
            serviceType: "chat",
            startedAt: new Date(),
            connectedAt: new Date()
        });
        
        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };
        
        jest.spyOn(redisService, 'getUserStatus').mockResolvedValue({ socketId: 'test_socket' });
        jest.spyOn(redisService, 'getChatSessionPayerId').mockResolvedValue(payer.id);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        chatSessionService.stop(); // Prevent interval leak if started
    });

    afterAll(async () => {
        // ...
    });

    test("emits 90% and 95% warnings when balance drops", async () => {
        // Mock affordableSeconds to simulate approaching 90%
        jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockResolvedValue({
            affordableSeconds: 60,
            hasSufficientBalance: true,
            pricingInfo: { pricing_id: 1, source: "mock" }
        });
        
        // Simulating elapsed time = 55 seconds out of 60 -> 91%
        await chat.update({ startedAt: new Date(Date.now() - 55000), connectedAt: new Date(Date.now() - 55000) });

        await chatSessionService.checkActiveSessionBalances(mockIo);
        
        expect(mockIo.to).toHaveBeenCalled();
        expect(mockIo.emit).toHaveBeenCalledWith('chat-duration-warning', expect.objectContaining({
            percentageUsed: expect.any(Number)
        }));
    });

    test("auto-ends chat with balance_exhausted when zero balance (checks real DB state)", async () => {
        // Mock affordableSeconds to simulate exhausted balance
        jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockResolvedValue({
            affordableSeconds: 60,
            hasSufficientBalance: true,
            pricingInfo: { pricing_id: 1, source: "mock" }
        });
        
        // Simulating elapsed time = 65 seconds out of 60 -> exhausted
        await chat.update({ startedAt: new Date(Date.now() - 65000), connectedAt: new Date(Date.now() - 65000) });

        await chatSessionService.checkActiveSessionBalances(mockIo);
        
        // Assert on the ACTUAL database row, not a mocked method call
        const updatedChat = await Chat.findByPk(chat.id);
        expect(updatedChat.status).toBe("ended");
        expect(updatedChat.endReason).toBe("balance_exhausted");
    });
});
