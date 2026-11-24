const conversationService = require("../../../src/services/conversation.service");
const billingService = require("../../../src/services/billing.service");
const { Chat, User, sequelize } = require("../../../src/models");

describe("Conversation Service", () => {
    let user1;
    let user2;

    beforeAll(async () => {
        // Create test users
        user1 = await User.create({
            name: "User One",
            email: "user1@example.com",
            mobileNumber: "3333333333",
            password: "password123",
            role: "user",
            isVerified: true,
        });

        user2 = await User.create({
            name: "User Two",
            email: "user2@example.com",
            mobileNumber: "4444444444",
            password: "password123",
            role: "listener",
            isVerified: true,
        });
    });

    afterAll(async () => {
        try {
            const models = require("../../../src/models");
            if (models.CommunicationCharge) await models.CommunicationCharge.destroy({ where: {} });
            if (models.Message) await models.Message.destroy({ where: {} });
            if (models.ChatParticipant) await models.ChatParticipant.destroy({ where: {} });
            if (models.ChatSetting) await models.ChatSetting.destroy({ where: {} });
        } catch (error) {
            console.warn("Teardown warning: could not clear child tables:", error.message);
        }
        await Chat.destroy({ where: {} });
        await User.destroy({ where: { id: [user1.id, user2.id] } });
        await sequelize.close();
    });

    describe("createConversation", () => {
        it("should create a new conversation", async () => {
            const conversation = await conversationService.createConversation(
                user1.id,
                user2.id,
                "chat"
            );

            expect(conversation).toBeDefined();
            expect(conversation.serviceType).toBe("chat");
            expect(conversation.status).toBe("created");
            expect([conversation.participant1Id, conversation.participant2Id]).toContain(user1.id);
            expect([conversation.participant1Id, conversation.participant2Id]).toContain(user2.id);
        });

        it("should return existing active conversation", async () => {
            const conversation1 = await conversationService.createConversation(
                user1.id,
                user2.id,
                "audio_call"
            );

            const conversation2 = await conversationService.createConversation(
                user1.id,
                user2.id,
                "audio_call"
            );

            expect(conversation1.id).toBe(conversation2.id);
        });

        it("should maintain consistent participant ordering", async () => {
            // End existing conversation first
            const existing = await Chat.findOne({
                where: {
                    status: { [require("sequelize").Op.in]: ["created", "started"] },
                },
            });
            if (existing) {
                await existing.update({ status: "ended" });
            }

            const conversation1 = await conversationService.createConversation(
                user1.id,
                user2.id,
                "chat"
            );

            await conversation1.update({ status: "ended" });

            const conversation2 = await conversationService.createConversation(
                user2.id,
                user1.id,
                "chat"
            );

            // Participants should be in same order regardless of who initiates
            expect(conversation1.participant1Id).toBe(conversation2.participant1Id);
            expect(conversation1.participant2Id).toBe(conversation2.participant2Id);
        });

        it("should reject a conversation between two users", async () => {
            // A user↔user session has no earner billing can price (commission role "user").
            const otherUser = await User.create({
                name: "User Three",
                email: "user3@example.com",
                mobileNumber: "5555555555",
                password: "password123",
                role: "user",
                isVerified: true,
            });
            try {
                await expect(
                    conversationService.createConversation(user1.id, otherUser.id, "chat")
                ).rejects.toThrow("Users cannot communicate with each other");
            } finally {
                await User.destroy({ where: { id: otherUser.id }, force: true });
            }
        });
    });

    describe("startConversation", () => {
        let conversation;

        beforeEach(async () => {
            // End any existing conversations
            await Chat.update({ status: "ended" }, { where: {} });

            conversation = await conversationService.createConversation(
                user1.id,
                user2.id,
                "video_call"
            );
        });

        it("should start a conversation", async () => {
            const started = await conversationService.startConversation(conversation.id, true);

            expect(started.conversation.status).toBe("started");
            expect(started.conversation.startedAt).toBeDefined();
            expect(started.conversation.startedAt).toBeInstanceOf(Date);
        });

        it("should return same conversation if already started", async () => {
            await conversationService.startConversation(conversation.id, true);
            const started = await conversationService.startConversation(conversation.id, true);

            expect(started.conversation.status).toBe("started");
        });

        it("should allow restarting an ended conversation", async () => {
            await conversation.update({ status: "ended" });

            const started = await conversationService.startConversation(conversation.id, true);
            expect(started.conversation.status).toBe("started");
        });

        it("should throw error if conversation not found", async () => {
            const fakeId = "00000000-0000-0000-0000-000000000000";

            await expect(conversationService.startConversation(fakeId)).rejects.toThrow(
                "Conversation not found"
            );
        });
    });

    describe("endConversation", () => {
        let conversation;

        beforeEach(async () => {
            await Chat.update({ status: "ended" }, { where: {} });

            conversation = await conversationService.createConversation(
                user1.id,
                user2.id,
                "chat"
            );
            await conversationService.startConversation(conversation.id, true);
        });

        it("should end a conversation and calculate duration", async () => {
            // Wait a bit to have some duration
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const result = await conversationService.endConversation(conversation.id, {
                reason: "manual",
                triggeredByUserId: user1.id,
                source: "conversation:end socket",
            });

            expect(result.conversation.status).toBe("ended");
            expect(result.conversation.endReason).toBe("manual");
            expect(result.conversation.endedByUserId).toBe(user1.id);
            expect(result.conversation.endTriggerSource).toBe("conversation:end socket");
            expect(result.conversation.endedAt).toBeDefined();
            expect(result.conversation.durationSeconds).toBeGreaterThan(0);
        });

        it("should return same result if already ended", async () => {
            const result1 = await conversationService.endConversation(conversation.id, { reason: "manual" });
            const result2 = await conversationService.endConversation(conversation.id, { reason: "system" });

            expect(result1.conversation.id).toBe(result2.conversation.id);
            expect(result2.billing).toBeNull();
            expect(result2.conversation.endReason).toBe("manual");
        });

        it("should throw error if conversation not started", async () => {
            const models = require("../../../src/models");
            await models.CommunicationCharge.destroy({ where: {} });
            await models.ChatParticipant.destroy({ where: {} });
            await Chat.destroy({ where: {} });

            const newConversation = await Chat.create({
                participant1Id: user1.id,
                participant2Id: user2.id,
                serviceType: "chat",
                status: "created",
            });

            const result = await conversationService.endConversation(newConversation.id, { reason: "system" });
            expect(result.conversation.status).toBe("ended");
            expect(result.conversation.durationSeconds).toBe(0);
            expect(result.conversation.endReason).toBe("system");
            expect(result.billing).toBeNull();
        });

        it("requires an allowed reason before opening a transaction", async () => {
            await expect(conversationService.endConversation(conversation.id)).rejects.toThrow(
                "A valid end reason is required"
            );
            await expect(conversationService.endConversation(conversation.id, { reason: "unknown" })).rejects.toThrow(
                "A valid end reason is required"
            );
        });

        it("should trigger billing for conversations with duration", async () => {
            // Mock billing service
            const mockBilling = jest.spyOn(billingService, "processConversationBilling");
            mockBilling.mockResolvedValue({
                charge: { id: "test-charge" },
                payerTransaction: { id: "payer-tx" },
                earnerTransaction: { id: "earner-tx" },
            });

            await new Promise((resolve) => setTimeout(resolve, 1000));
            const result = await conversationService.endConversation(conversation.id, { reason: "manual" });

            expect(result.conversation.durationSeconds).toBeGreaterThan(0);
            expect(mockBilling.mock.calls[0][0]).toBe(conversation.id);

            mockBilling.mockRestore();
        });

        it("should exclude paused (reconnect) seconds from the billed duration", async () => {
            // Backdate the session for a deterministic ~100s billed span (billing runs from connectedAt)
            const backdated = new Date(Date.now() - 100 * 1000);
            await Chat.update(
                { startedAt: backdated, connectedAt: backdated },
                { where: { id: conversation.id } }
            );

            const result = await conversationService.endConversation(conversation.id, { pausedSeconds: 30, reason: "disconnect" });

            // ~100s elapsed minus 30s paused ≈ 70s (allow small timing slack)
            expect(result.conversation.durationSeconds).toBeGreaterThanOrEqual(69);
            expect(result.conversation.durationSeconds).toBeLessThanOrEqual(71);
        });

        it("should floor duration to 0 and skip billing when paused time exceeds the span", async () => {
            const mockBilling = jest.spyOn(billingService, "processConversationBilling");

            const backdated = new Date(Date.now() - 10 * 1000);
            await Chat.update(
                { startedAt: backdated, connectedAt: backdated },
                { where: { id: conversation.id } }
            );

            const result = await conversationService.endConversation(conversation.id, { pausedSeconds: 30, reason: "disconnect" });

            expect(result.conversation.durationSeconds).toBe(0);
            expect(result.billing).toBeNull();
            expect(mockBilling).not.toHaveBeenCalled();

            mockBilling.mockRestore();
        });

        it("does not bill (or use free minutes) for a chat the other side never answered", async () => {
            const mockBilling = jest.spyOn(billingService, "processConversationBilling");
            await Chat.update({ status: "ended" }, { where: { id: conversation.id } });
            await conversationService.startConversation(conversation.id, true, user1.id, "chat", null, { awaitingReply: true });
            await Chat.update(
                { startedAt: new Date(Date.now() - 120 * 1000) },
                { where: { id: conversation.id } }
            );

            const result = await conversationService.endConversation(conversation.id, { reason: "no_response" });

            expect(result.conversation.status).toBe("ended");
            expect(result.conversation.endReason).toBe("no_response");
            expect(result.conversation.durationSeconds).toBe(0);
            expect(result.billing).toBeNull();
            expect(mockBilling).not.toHaveBeenCalled();
            mockBilling.mockRestore();
        });

        it("bills a chat only from the moment it connected", async () => {
            await Chat.update({ status: "ended" }, { where: { id: conversation.id } });
            await conversationService.startConversation(conversation.id, true, user1.id, "chat", null, { awaitingReply: true });
            await Chat.update(
                {
                    startedAt: new Date(Date.now() - 300 * 1000),
                    connectedAt: new Date(Date.now() - 40 * 1000),
                },
                { where: { id: conversation.id } }
            );

            const result = await conversationService.endConversation(conversation.id, { reason: "manual" });

            expect(result.conversation.durationSeconds).toBeGreaterThanOrEqual(39);
            expect(result.conversation.durationSeconds).toBeLessThanOrEqual(41);
        });
    });

    describe("markChatConnected", () => {
        let conversation;

        beforeEach(async () => {
            await Chat.update({ status: "ended" }, { where: {} });
            conversation = await conversationService.createConversation(user1.id, user2.id, "chat");
        });

        it("starts connected by default (calls) and unconnected when awaiting a reply", async () => {
            const call = await conversationService.startConversation(conversation.id, true);
            expect(call.conversation.connectedAt).toEqual(call.conversation.startedAt);

            await Chat.update({ status: "ended" }, { where: { id: conversation.id } });
            const chat = await conversationService.startConversation(conversation.id, true, user1.id, "chat", null, { awaitingReply: true });
            expect(chat.conversation.connectedAt).toBeNull();
        });

        it("connects a started chat exactly once", async () => {
            await conversationService.startConversation(conversation.id, true, user1.id, "chat", null, { awaitingReply: true });

            expect(await conversationService.markChatConnected(conversation.id)).toBe(true);
            expect(await conversationService.markChatConnected(conversation.id)).toBe(false);
            const row = await Chat.findByPk(conversation.id);
            expect(row.connectedAt).not.toBeNull();
        });

        it("does not connect a chat that is not started", async () => {
            expect(await conversationService.markChatConnected(conversation.id)).toBe(false);
        });
    });

    describe("getConversationDetails", () => {
        it("should retrieve conversation with participant details", async () => {
            const conversation = await Chat.findOne();
            const details = await conversationService.getConversationDetails(conversation.id);

            expect(details).toBeDefined();
            expect(details.participant1).toBeDefined();
            expect(details.participant2).toBeDefined();
            expect(details.participant1.name).toBeDefined();
            expect(details.participant2.name).toBeDefined();
        });

        it("should throw error if conversation not found", async () => {
            const fakeId = "00000000-0000-0000-0000-000000000000";

            await expect(
                conversationService.getConversationDetails(fakeId)
            ).rejects.toThrow("Conversation not found");
        });
    });

    describe("getUserConversations", () => {
        it("should retrieve user conversations with pagination", async () => {
            const result = await conversationService.getUserConversations(
                user1.id,
                {},
                { page: 1, limit: 10 }
            );

            expect(result).toBeDefined();
            expect(result.conversations).toBeInstanceOf(Array);
            expect(result.totalCount).toBeGreaterThan(0);
            expect(result.currentPage).toBe(1);
        });

        it("should filter by status", async () => {
            const result = await conversationService.getUserConversations(
                user1.id,
                { status: "ended" },
                { page: 1, limit: 10 }
            );

            expect(result.conversations.every((c) => c.status === "ended")).toBe(true);
        });

        it("should filter by service type", async () => {
            const result = await conversationService.getUserConversations(
                user1.id,
                { serviceType: "chat" },
                { page: 1, limit: 10 }
            );

            expect(result.conversations.every((c) => c.serviceType === "chat")).toBe(true);
        });
    });

    describe("getActiveConversations", () => {
        it("should retrieve only active conversations", async () => {
            const conversations = await conversationService.getActiveConversations(user1.id);

            expect(conversations).toBeInstanceOf(Array);
            expect(
                conversations.every((c) => ["created", "started"].includes(c.status))
            ).toBe(true);
        });
    });

    describe("getConversationStats", () => {
        it("should return conversation statistics", async () => {
            const stats = await conversationService.getConversationStats(user1.id);

            expect(stats).toBeDefined();
            expect(stats.totalConversations).toBeGreaterThan(0);
            expect(stats.activeConversations).toBeGreaterThanOrEqual(0);
            expect(stats.endedConversations).toBeGreaterThanOrEqual(0);
            expect(stats.totalDurationSeconds).toBeGreaterThanOrEqual(0);
            expect(stats.totalDurationMinutes).toBeGreaterThanOrEqual(0);
        });
    });
});

describe("Conversation Service: request cleanup and active session lookup", () => {
    const models = require("../../../src/models");
    const redisService = require("../../../src/services/redis.service");
    let payer;
    let listener;

    beforeAll(async () => {
        const rand = Math.floor(Math.random() * 1000000);
        payer = await User.create({ name: "Payer", email: `cleanup-payer${rand}@example.com`, mobileNumber: `7${rand}`.padEnd(10, "1"), role: "user", isVerified: true });
        listener = await User.create({ name: "Asha", email: `cleanup-listener${rand}@example.com`, mobileNumber: `6${rand}`.padEnd(10, "2"), role: "listener", isVerified: true });
    });

    afterEach(async () => {
        await models.CallRequest.destroy({ where: {} });
        await models.CommunicationCharge.destroy({ where: {} });
        await models.ChatParticipant.destroy({ where: {} });
        await Chat.destroy({ where: { participant1Id: [payer.id, listener.id] } });
        await Chat.destroy({ where: { participant2Id: [payer.id, listener.id] } });
        redisService.client.hGetAll.mockResolvedValue({});
    });

    it("closes every open request for the pair when a started session ends, and drops the call mirrors", async () => {
        const conversation = await conversationService.createConversation(payer.id, listener.id, "chat");
        await conversationService.startConversation(conversation.id, true);
        const older = await models.CallRequest.create({ senderId: payer.id, receiverId: listener.id, requestType: "chat", status: "accepted", requestTimestamp: new Date(), acceptanceTimestamp: new Date(Date.now() - 60000) });
        const newer = await models.CallRequest.create({ senderId: payer.id, receiverId: listener.id, requestType: "chat", status: "accepted", requestTimestamp: new Date(), acceptanceTimestamp: new Date() });
        const pending = await models.CallRequest.create({ senderId: listener.id, receiverId: payer.id, requestType: "audio", status: "pending", requestTimestamp: new Date() });
        redisService.client.hGetAll.mockImplementation(async (key) => (key === `call:${conversation.id}` ? { requestId: "req-mirror" } : {}));
        redisService.client.del.mockClear();

        await conversationService.endConversation(conversation.id, { reason: "manual" });

        expect((await models.CallRequest.findByPk(older.id)).status).toBe("ended");
        expect((await models.CallRequest.findByPk(newer.id)).status).toBe("ended");
        expect((await models.CallRequest.findByPk(pending.id)).status).toBe("cancelled");
        expect(redisService.client.del).toHaveBeenCalledWith("call:req-mirror");
        expect(redisService.client.del).toHaveBeenCalledWith(`call:${conversation.id}`);
        expect((await conversationService.isUserTrulyBusy(listener.id)).status).toBe("NOT_BUSY");
    });

    it("getActiveSessionFor names the started chat and the other person", async () => {
        const conversation = await conversationService.createConversation(payer.id, listener.id, "chat");
        await conversationService.startConversation(conversation.id, true);

        const active = await conversationService.getActiveSessionFor(payer.id);

        expect(active).toEqual({
            chatId: conversation.id,
            peerId: listener.id,
            peerName: "Asha",
            type: "chat",
            started: true,
            requestId: null,
        });
    });

    it("getActiveSessionFor falls back to a live unstarted request, and ignores stale ones", async () => {
        const conversation = await conversationService.createConversation(payer.id, listener.id, "chat");
        await models.CallRequest.create({ senderId: payer.id, receiverId: listener.id, requestType: "audio", status: "accepted", requestTimestamp: new Date(Date.now() - 10 * 60000), acceptanceTimestamp: new Date(Date.now() - 10 * 60000) });
        expect(await conversationService.getActiveSessionFor(payer.id)).toBeNull();

        const live = await models.CallRequest.create({ senderId: payer.id, receiverId: listener.id, requestType: "chat", status: "pending", requestTimestamp: new Date() });

        const active = await conversationService.getActiveSessionFor(payer.id);
        expect(active).toEqual(expect.objectContaining({
            chatId: conversation.id, peerId: listener.id, started: false, requestId: live.id, type: "chat",
        }));
    });
});
