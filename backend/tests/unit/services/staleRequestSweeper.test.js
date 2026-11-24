const mockCallRequest = { findAll: jest.fn(), update: jest.fn() };

jest.mock("../../../src/models", () => ({
    CallRequest: mockCallRequest,
    Chat: { findOne: jest.fn() },
    User: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock("../../../src/services/redis.service", () => ({
    client: { set: jest.fn(), del: jest.fn().mockResolvedValue(), scanIterator: jest.fn() },
    getUserBusyStatus: jest.fn(),
    clearUserBusyStatus: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/conversation.service", () => ({
    isUserTrulyBusy: jest.fn(),
    isBusyHashLive: jest.fn(),
    releaseBusyForSession: jest.fn().mockResolvedValue({ freed: [] }),
}));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { Op } = require("sequelize");
const { Chat, User } = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");
const conversationService = require("../../../src/services/conversation.service");
const sweeper = require("../../../src/services/staleRequestSweeper.service");

const SENDER = "user-1";
const RECEIVER = "listener-1";
const request = (id, extra = {}) => ({ id, senderId: SENDER, receiverId: RECEIVER, ...extra });

beforeEach(() => {
    jest.clearAllMocks();
    redisService.client.set.mockResolvedValue("OK");
    mockCallRequest.findAll.mockResolvedValue([]);
    mockCallRequest.update.mockResolvedValue([1]);
    Chat.findOne.mockResolvedValue({ id: "chat-1", status: "created" });
    User.findAll.mockResolvedValue([]);
    User.findByPk.mockImplementation(async (id) => ({ id }));
    scanKeys([]);
});

// node-redis v5 scanIterator yields batches of keys.
const scanKeys = (keys) =>
    redisService.client.scanIterator.mockImplementation(async function* () {
        if (keys.length) yield keys;
    });

afterEach(() => sweeper.stop());

describe("staleRequestSweeper.sweep", () => {
    it("does nothing when another instance holds the lock", async () => {
        redisService.client.set.mockResolvedValue(null);

        expect(await sweeper.sweep()).toBeNull();
        expect(mockCallRequest.findAll).not.toHaveBeenCalled();
        expect(redisService.client.del).not.toHaveBeenCalledWith("busy-sweeper-lock");
    });

    it("queries pending and accepted requests older than 2 minutes", async () => {
        await sweeper.sweep();

        const [pendingQuery, acceptedQuery] = mockCallRequest.findAll.mock.calls.map((c) => c[0].where);
        expect(pendingQuery.status).toBe("pending");
        expect(Date.now() - pendingQuery.requestTimestamp[Op.lt].getTime()).toBeGreaterThanOrEqual(2 * 60 * 1000 - 100);
        expect(acceptedQuery.status).toBe("accepted");
        const [withTs, legacy] = acceptedQuery[Op.or];
        expect(Date.now() - withTs.acceptanceTimestamp[Op.lt].getTime()).toBeGreaterThanOrEqual(2 * 60 * 1000 - 100);
        expect(Date.now() - withTs.acceptanceTimestamp[Op.lt].getTime()).toBeLessThan(3 * 60 * 1000);
        expect(legacy.acceptanceTimestamp).toBeNull();
    });

    it("marks stale pending requests missed and frees both users", async () => {
        mockCallRequest.findAll.mockResolvedValueOnce([request("req-1")]).mockResolvedValueOnce([]);
        const io = { emit: jest.fn() };

        const counts = await sweeper.sweep(io);

        expect(counts.missed).toBe(1);
        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "missed" }),
            { where: { id: "req-1", status: "pending" } }
        );
        expect(redisService.client.del).toHaveBeenCalledWith("call:req-1");
        expect(redisService.client.del).toHaveBeenCalledWith("call:chat-1");
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith({
            conversationId: "chat-1", userIds: [SENDER, RECEIVER], io,
        });
    });

    it("skips a pending request that was accepted while the sweep was running", async () => {
        mockCallRequest.findAll.mockResolvedValueOnce([request("req-1")]).mockResolvedValueOnce([]);
        mockCallRequest.update.mockResolvedValue([0]);

        const counts = await sweeper.sweep();

        expect(counts.missed).toBe(0);
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
    });

    it("ends a stale accepted request whose chat never started", async () => {
        mockCallRequest.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([request("req-2")]);

        const counts = await sweeper.sweep();

        expect(counts.ended).toBe(1);
        expect(mockCallRequest.update).toHaveBeenCalledWith(
            { status: "ended" },
            { where: { id: "req-2", status: "accepted" } }
        );
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith(
            expect.objectContaining({ conversationId: "chat-1", userIds: [SENDER, RECEIVER] })
        );
    });

    it("leaves a stale-looking accepted request alone when its chat is started (live session)", async () => {
        mockCallRequest.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([request("req-3")]);
        Chat.findOne.mockResolvedValue({ id: "chat-1", status: "started" });

        const counts = await sweeper.sweep();

        expect(counts.ended).toBe(0);
        expect(mockCallRequest.update).not.toHaveBeenCalled();
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
    });

    it("heals a DB busy flag nothing backs, but not manual busy or sessions that are really live", async () => {
        User.findAll.mockResolvedValue([{ id: "orphan" }, { id: "has-redis" }, { id: "has-chat" }]);
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === "has-redis" ? { conversationId: "c" } : null));
        conversationService.isUserTrulyBusy.mockImplementation(async (id) => ({ status: id === "has-chat" ? "BUSY" : "NOT_BUSY" }));
        conversationService.releaseBusyForSession.mockResolvedValue({ freed: ["orphan"] });

        const counts = await sweeper.sweep();

        expect(User.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { isBusy: true, isManualBusy: false } }));
        expect(counts.healed).toBe(1);
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledTimes(1);
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith(
            expect.objectContaining({ userIds: ["orphan"], force: true })
        );
    });

    it("clears an orphaned Redis busy hash even when the DB flag is already false", async () => {
        scanKeys(["user:orphan:busy", "user:live:busy"]);
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: "old-chat" });
        conversationService.isBusyHashLive.mockImplementation(async (id) => id === "live");
        conversationService.releaseBusyForSession.mockResolvedValue({ freed: ["orphan"] });

        const counts = await sweeper.sweep();

        expect(redisService.client.scanIterator).toHaveBeenCalledWith(expect.objectContaining({ MATCH: "user:*:busy" }));
        expect(counts.healed).toBe(1);
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledTimes(1);
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith(
            expect.objectContaining({ userIds: ["orphan"], force: true })
        );
    });

    it("drops the busy hash of a user that no longer exists", async () => {
        scanKeys(["user:gone:busy"]);
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: "c" });
        User.findByPk.mockResolvedValue(null);

        await sweeper.sweep();

        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith("gone");
        expect(conversationService.isBusyHashLive).not.toHaveBeenCalled();
    });

    it("always releases its lock, even when a step throws", async () => {
        mockCallRequest.findAll.mockRejectedValue(new Error("db down"));

        await expect(sweeper.sweep()).rejects.toThrow("db down");

        expect(redisService.client.del).toHaveBeenCalledWith("busy-sweeper-lock");
    });
});
