const mockCallRequest = { update: jest.fn().mockResolvedValue([1]) };
const mockOrder = [];

jest.mock("../../../src/models", () => ({
    Chat: { findByPk: jest.fn(), findOne: jest.fn(), count: jest.fn() },
    User: { update: jest.fn().mockResolvedValue([1]), findAll: jest.fn() },
    ChatParticipant: {},
    ChatSetting: {},
    CallRequest: mockCallRequest,
    sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../src/services/billing.service", () => ({
    processConversationBilling: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../src/services/wallet.service", () => ({}));
jest.mock("../../../src/services/pricing.service", () => ({}));
jest.mock("../../../src/services/redis.service", () => ({
    getUserBusyStatus: jest.fn(),
    clearUserBusyStatus: jest.fn(),
    client: { hGetAll: jest.fn(), del: jest.fn() },
}));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { Chat, User, sequelize } = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");
const conversationService = require("../../../src/services/conversation.service");

const USER = "user-1";
const LISTENER = "listener-1";
const CHAT = "chat-1";

function makeTransaction({ failCommit = false } = {}) {
    const t = {
        LOCK: { UPDATE: "UPDATE" },
        finished: undefined,
        commit: jest.fn(async () => {
            mockOrder.push("commit");
            if (failCommit) throw new Error("commit failed");
            t.finished = "commit";
        }),
        rollback: jest.fn(async () => { mockOrder.push("rollback"); t.finished = "rollback"; }),
    };
    return t;
}

const conversation = (overrides = {}) => ({
    id: CHAT,
    participant1Id: USER,
    participant2Id: LISTENER,
    status: "created",
    serviceType: "chat", // the placeholder row is often still "chat" for a call
    startedAt: null,
    createdAt: new Date(),
    update: jest.fn().mockResolvedValue(),
    ...overrides,
});

const fetchedFlags = (overrides = {}) => [
    { id: USER, manualOffline: false, isManualBusy: false },
    { id: LISTENER, manualOffline: false, isManualBusy: false, ...overrides },
];

beforeEach(() => {
    jest.clearAllMocks();
    mockOrder.length = 0;
    Chat.findOne.mockResolvedValue(null);
    User.findAll.mockResolvedValue(fetchedFlags());
    redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT });
    redisService.clearUserBusyStatus.mockImplementation(async () => { mockOrder.push("redis-clear"); });
});

describe("endConversation: never-started branch", () => {
    it("frees both users and closes accepted + pending requests even though the row type is 'chat'", async () => {
        const t = makeTransaction();
        sequelize.transaction.mockResolvedValue(t);
        Chat.findByPk.mockResolvedValue(conversation());
        const io = { emit: jest.fn() };

        const result = await conversationService.endConversation(CHAT, { reason: "system", io });

        expect(result.billing).toBeNull();
        expect(mockCallRequest.update).toHaveBeenCalledWith(
            { status: "ended" },
            expect.objectContaining({ where: expect.objectContaining({ status: "accepted" }), transaction: t })
        );
        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "cancelled" }),
            expect.objectContaining({ where: expect.objectContaining({ status: "pending" }), transaction: t })
        );
        expect(User.update).toHaveBeenCalledWith(
            { isBusy: false },
            { where: { id: LISTENER, isManualBusy: false }, transaction: t }
        );
        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(USER);
        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(LISTENER);
        expect(io.emit).toHaveBeenCalledWith("listener:status-changed", expect.objectContaining({ listenerId: LISTENER, isBusy: false }));
    });

    it("does not touch Redis or broadcast until the transaction has committed", async () => {
        const t = makeTransaction();
        sequelize.transaction.mockResolvedValue(t);
        Chat.findByPk.mockResolvedValue(conversation());

        await conversationService.endConversation(CHAT, { reason: "system", io: { emit: jest.fn() } });

        expect(mockOrder.indexOf("commit")).toBeLessThan(mockOrder.indexOf("redis-clear"));
    });

    it("skips a participant who has another started chat", async () => {
        const t = makeTransaction();
        sequelize.transaction.mockResolvedValue(t);
        Chat.findByPk.mockResolvedValue(conversation());
        Chat.findOne.mockImplementation(async ({ where }) =>
            where[require("sequelize").Op.or].some((c) => c.participant1Id === LISTENER) ? { id: "other" } : null
        );

        await conversationService.endConversation(CHAT, { reason: "system", io: { emit: jest.fn() } });

        expect(User.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: { id: LISTENER, isManualBusy: false } }));
        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalledWith(LISTENER);
        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(USER);
    });
});

describe("endConversation: started branch", () => {
    const startedConversation = () =>
        conversation({ status: "started", serviceType: "chat", startedAt: new Date(Date.now() - 60_000) });

    it("keeps a listener's manual do-not-disturb after the session ends", async () => {
        const t = makeTransaction();
        sequelize.transaction.mockResolvedValue(t);
        Chat.findByPk.mockResolvedValue(startedConversation());
        User.findAll.mockResolvedValue(fetchedFlags({ isManualBusy: true }));
        const io = { emit: jest.fn() };

        await conversationService.endConversation(CHAT, { reason: "manual", io });

        // The DB reset is scoped to isManualBusy:false, so the manual flag survives; the broadcast says still busy.
        expect(User.update).toHaveBeenCalledWith(
            { isBusy: false },
            expect.objectContaining({ where: { id: LISTENER, isManualBusy: false } })
        );
        expect(io.emit).toHaveBeenCalledWith("listener:status-changed", expect.objectContaining({
            listenerId: LISTENER, isBusy: true, busyType: "manual",
        }));
    });

    it("clears nothing in Redis and broadcasts nothing when the transaction fails to commit", async () => {
        const nested = makeTransaction();
        const t = makeTransaction({ failCommit: true });
        sequelize.transaction.mockResolvedValueOnce(t).mockResolvedValue(nested);
        Chat.findByPk.mockResolvedValue(startedConversation());
        const io = { emit: jest.fn() };

        await expect(conversationService.endConversation(CHAT, { reason: "manual", io })).rejects.toThrow("commit failed");

        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalled();
        expect(io.emit).not.toHaveBeenCalled();
    });

    it("leaves a participant's Redis flag alone when it now belongs to a different conversation", async () => {
        const t = makeTransaction();
        sequelize.transaction.mockResolvedValue(t);
        Chat.findByPk.mockResolvedValue(startedConversation());
        redisService.getUserBusyStatus.mockImplementation(async (uid) =>
            uid === LISTENER ? { conversationId: "newer-chat" } : { conversationId: CHAT }
        );

        await conversationService.endConversation(CHAT, { reason: "manual", io: { emit: jest.fn() } });

        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(USER);
        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalledWith(LISTENER);
    });
});

describe("createConversation keeps the placeholder row's type in step", () => {
    const { Chat: ChatModel } = require("../../../src/models");

    it("updates serviceType on an existing row that has not started", async () => {
        const row = { id: CHAT, status: "created", serviceType: "chat", update: jest.fn().mockResolvedValue() };
        ChatModel.findOne.mockResolvedValue(row);

        await conversationService.createConversation(USER, LISTENER, "video_call");

        expect(row.update).toHaveBeenCalledWith({ serviceType: "video_call" });
    });

    it("never rewrites the type of a started conversation", async () => {
        const row = { id: CHAT, status: "started", serviceType: "chat", update: jest.fn() };
        ChatModel.findOne.mockResolvedValue(row);

        await conversationService.createConversation(USER, LISTENER, "video_call");

        expect(row.update).not.toHaveBeenCalled();
    });
});
