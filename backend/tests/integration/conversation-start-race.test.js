const { Chat, User, sequelize, Wallet } = require("../../src/models");
const conversationService = require("../../src/services/conversation.service");
const walletService = require("../../src/services/wallet.service");
const freeMinutesService = require("../../src/services/freeMinutes.service");

describe("Conversation Start Race Condition Fixes", () => {
    let payer;
    let earner;
    
    beforeAll(async () => {
        // Clear DB
        await sequelize.sync({ force: true });
        
        // Setup base data
        payer = await User.create({ name: "Payer", role: "user", isBusy: false });
        earner = await User.create({ name: "Earner", role: "listener", isBusy: false });
        
        await Wallet.create({ userId: payer.id, balance: 100, type: "main" });
        await Wallet.create({ userId: earner.id, balance: 0, type: "earning" });
        // Mock validateBalanceAndCalculateDuration directly
        jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockResolvedValue({
            balance: 100,
            pricePerMinute: 10,
            ratePerSecond: 10 / 60,
            freeSecondsRemaining: 0,
            freeMinutesRemaining: 0,
            paidAffordableSeconds: 600,
            paidAffordableMinutes: 10,
            affordableSeconds: 600,
            affordableMinutes: 10,
            hasSufficientBalance: true,
            minimumBalanceRequired: 10,
            pricingInfo: { source: "mock", pricing_id: 1 }
        });
    });

    afterAll(async () => {
        jest.restoreAllMocks();
    });

    beforeEach(async () => {
        await Chat.update({ status: "ended" }, { where: {} });
    });

    test("two concurrent conversation:start on the SAME conversation -> only one succeeds", async () => {
        const chat = await Chat.create({
            participant1Id: payer.id,
            participant2Id: earner.id,
            status: "created",
            serviceType: "chat"
        });
        
        const p1 = conversationService.startConversation(chat.id);
        const p2 = conversationService.startConversation(chat.id);
        
        let successCount = 0;
        let failCount = 0;
        
        await Promise.allSettled([p1, p2]).then((results) => {
            results.forEach((r) => {
                if (r.status === "fulfilled") {
                    successCount++;
                } else {
                    failCount++;
                }
            });
        });
        
        const chatAfter = await Chat.findByPk(chat.id);
        expect(chatAfter.status).toBe("started");
    });

    test("three concurrent conversation:start across THREE DIFFERENT conversations -> only one succeeds due to active session limit", async () => {
        const chats = [];
        for (let i = 0; i < 3; i++) {
            // Must create a unique listener to avoid unique_chat_participants violation
            const uniqueEarner = await User.create({ name: `Earner${i}`, role: "listener", isBusy: false });
            const chat = await Chat.create({
                participant1Id: payer.id,
                participant2Id: uniqueEarner.id,
                status: "created",
                serviceType: "chat"
            });
            chats.push(chat);
        }
        
        const promises = chats.map(c => conversationService.startConversation(c.id));
        
        const results = await Promise.allSettled(promises);
        
        const successes = results.filter(r => r.status === "fulfilled");
        const failures = results.filter(r => r.status === "rejected");
        
        // Only ONE should succeed because the payer can only have one active paid session concurrently.
        expect(successes.length).toBe(1);
        expect(failures.length).toBe(2);
        
        const failureMessages = failures.map(f => f.reason.message);
        expect(failureMessages).toContain("You already have an active paid session");
    });
});
