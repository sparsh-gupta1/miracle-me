const mockCallRequest = { update: jest.fn().mockResolvedValue([1]), count: jest.fn() };

jest.mock("../../../src/models", () => ({
    Chat: { count: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
    User: { update: jest.fn().mockResolvedValue([1]), findAll: jest.fn(), findByPk: jest.fn() },
    ChatParticipant: {},
    ChatSetting: {},
    CallRequest: mockCallRequest,
    sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../src/services/billing.service", () => ({}));
jest.mock("../../../src/services/wallet.service", () => ({}));
jest.mock("../../../src/services/pricing.service", () => ({}));
jest.mock("../../../src/services/redis.service", () => ({
    getUserBusyStatus: jest.fn(),
    clearUserBusyStatus: jest.fn().mockResolvedValue(),
    client: { hGetAll: jest.fn(), del: jest.fn().mockResolvedValue() },
}));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { Op } = require("sequelize");
const { Chat, User } = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");
const conversationService = require("../../../src/services/conversation.service");

const USER = "user-1";
const LISTENER = "listener-1";
const CHAT = "chat-1";

const flags = (overrides = {}) => ({ id: LISTENER, manualOffline: false, isManualBusy: false, isBusy: false, ...overrides });

beforeEach(() => {
    jest.clearAllMocks();
    Chat.count.mockResolvedValue(0);
    Chat.findOne.mockResolvedValue(null);
    Chat.findByPk.mockResolvedValue({ id: CHAT, status: "created", participant1Id: USER, participant2Id: LISTENER });
    User.findAll.mockResolvedValue([flags({ id: USER }), flags({ id: LISTENER })]);
    User.findByPk.mockResolvedValue(flags());
    redisService.client.hGetAll.mockResolvedValue({ requestId: "req-1" });
});

describe("releaseBusyForSession", () => {
    it("frees users (DB + Redis + broadcast) when nothing live holds them", async () => {
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT, type: "chat" });
        const io = { emit: jest.fn() };

        const { freed } = await conversationService.releaseBusyForSession({
            conversationId: CHAT, userIds: [USER, LISTENER], io,
        });

        expect(freed).toEqual([USER, LISTENER]);
        expect(User.update).toHaveBeenCalledWith({ isBusy: false }, { where: { id: LISTENER, isManualBusy: false } });
        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(USER);
        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(LISTENER);
        expect(io.emit).toHaveBeenCalledWith("listener:status-changed", {
            listenerId: LISTENER, isOnline: true, isBusy: false, busyType: undefined,
        });
    });

    it("does nothing while the conversation itself is started (a live session owns the flags)", async () => {
        Chat.findByPk.mockResolvedValue({ id: CHAT, status: "started" });

        const { freed } = await conversationService.releaseBusyForSession({
            conversationId: CHAT, userIds: [USER, LISTENER],
        });

        expect(freed).toEqual([]);
        expect(User.update).not.toHaveBeenCalled();
        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalled();
    });

    it("skips a user who has another started chat", async () => {
        Chat.findOne.mockImplementation(async ({ where }) => {
            const clause = where[Op.or];
            return clause.some((c) => c.participant1Id === LISTENER) ? { id: "other-chat" } : null;
        });
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT });

        const { freed } = await conversationService.releaseBusyForSession({
            conversationId: CHAT, userIds: [USER, LISTENER],
        });

        expect(freed).toEqual([USER]);
        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalledWith(LISTENER);
    });

    it("leaves Redis state that belongs to a different conversation alone", async () => {
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: "another-chat" });

        await conversationService.releaseBusyForSession({ conversationId: CHAT, userIds: [LISTENER] });

        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalled();
    });

    it("clears a stale flag regardless of ownership when forced", async () => {
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: "another-chat" });

        await conversationService.releaseBusyForSession({ userIds: [LISTENER], force: true });

        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(LISTENER);
    });

    it("never clears a listener's manual do-not-disturb and broadcasts it as still busy", async () => {
        User.findAll.mockResolvedValue([flags({ id: LISTENER, isManualBusy: true })]);
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT });
        const io = { emit: jest.fn() };

        await conversationService.releaseBusyForSession({ conversationId: CHAT, userIds: [LISTENER], io });

        // The DB update is scoped to non-manual users, so the manual flag survives.
        expect(User.update).toHaveBeenCalledWith({ isBusy: false }, { where: { id: LISTENER, isManualBusy: false } });
        expect(io.emit).toHaveBeenCalledWith("listener:status-changed", expect.objectContaining({
            listenerId: LISTENER, isBusy: true, busyType: "manual",
        }));
    });

    it("broadcasts a manually offline listener as offline, not online", async () => {
        User.findAll.mockResolvedValue([flags({ id: LISTENER, manualOffline: true })]);
        redisService.getUserBusyStatus.mockResolvedValue(null);
        const io = { emit: jest.fn() };

        await conversationService.releaseBusyForSession({ conversationId: CHAT, userIds: [LISTENER], io });

        expect(io.emit).toHaveBeenCalledWith("listener:status-changed", expect.objectContaining({
            listenerId: LISTENER, isOnline: false, isBusy: false,
        }));
    });

    it("keeps releasing the other users when one Redis clear fails", async () => {
        redisService.getUserBusyStatus.mockResolvedValue(null);
        redisService.clearUserBusyStatus.mockRejectedValueOnce(new Error("redis down")).mockResolvedValue();
        const io = { emit: jest.fn() };

        await conversationService.releaseBusyForSession({ conversationId: CHAT, userIds: [USER, LISTENER], io });

        expect(redisService.clearUserBusyStatus).toHaveBeenCalledTimes(2);
        expect(io.emit).toHaveBeenCalledTimes(2);
    });
});

describe("releaseUnstartedRequestState (session failed to start after a request)", () => {
    it("closes accepted AND pending requests, drops the call hashes and frees both users", async () => {
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT, type: "chat" });

        const { freed } = await conversationService.releaseUnstartedRequestState(CHAT, [USER, LISTENER]);

        expect(freed).toEqual([USER, LISTENER]);
        expect(mockCallRequest.update).toHaveBeenCalledWith(
            { status: "ended" },
            expect.objectContaining({ where: expect.objectContaining({ status: "accepted" }) })
        );
        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "cancelled" }),
            expect.objectContaining({ where: expect.objectContaining({ status: "pending" }) })
        );
        expect(redisService.client.del).toHaveBeenCalledWith("call:req-1");
        expect(redisService.client.del).toHaveBeenCalledWith(`call:${CHAT}`);
    });

    it("does nothing when the chat actually started (a later step failed, not the start)", async () => {
        Chat.findByPk.mockResolvedValue({ id: CHAT, status: "started", participant1Id: USER, participant2Id: LISTENER });

        const { freed } = await conversationService.releaseUnstartedRequestState(CHAT, [USER, LISTENER]);

        expect(freed).toEqual([]);
        expect(mockCallRequest.update).not.toHaveBeenCalled();
        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalled();
    });
});

describe("getBusyInfo", () => {
    it("reports manual do-not-disturb as manual busy", async () => {
        User.findAll.mockResolvedValue([flags({ isManualBusy: true, isBusy: true })]);

        const info = (await conversationService.getBusyInfo([LISTENER])).get(LISTENER);

        expect(info).toEqual({ isBusy: true, type: "manual", since: null });
        expect(redisService.getUserBusyStatus).not.toHaveBeenCalled();
    });

    it("reports a Redis session hash with its real type while its conversation is started", async () => {
        User.findAll.mockResolvedValue([flags({ isBusy: true })]);
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT, type: "video_call", since: "2026-10-06T10:00:00Z" });
        Chat.findByPk.mockResolvedValue({ id: CHAT, status: "started" });

        const info = (await conversationService.getBusyInfo([LISTENER])).get(LISTENER);

        expect(info).toEqual({ isBusy: true, type: "video_call", since: "2026-10-06T10:00:00Z" });
    });

    it("keeps a Redis hash for a request that is still ringing (no started chat yet)", async () => {
        User.findAll.mockResolvedValue([flags({ isBusy: true })]);
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT, type: "audio_call", since: "s" });
        Chat.findByPk.mockResolvedValue({ id: CHAT, status: "created" });
        mockCallRequest.count.mockResolvedValue(1);

        const info = (await conversationService.getBusyInfo([LISTENER])).get(LISTENER);

        expect(info.isBusy).toBe(true);
        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalled();
    });

    it("reports an orphaned Redis hash (session over, no live request) as free and heals it", async () => {
        User.findAll.mockResolvedValue([flags({ isBusy: false })]);
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT, type: "chat", since: "s" });
        Chat.findByPk.mockResolvedValue({ id: CHAT, status: "ended" });
        mockCallRequest.count.mockResolvedValue(0);

        const info = (await conversationService.getBusyInfo([LISTENER])).get(LISTENER);
        await new Promise((resolve) => setImmediate(resolve)); // background heal
        await new Promise((resolve) => setImmediate(resolve));

        expect(info).toEqual({ isBusy: false, type: null, since: null });
        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(LISTENER);
    });

    it("reports a listener who is manually offline as not busy", async () => {
        User.findAll.mockResolvedValue([flags({ manualOffline: true, isBusy: true, isManualBusy: true })]);

        const info = (await conversationService.getBusyInfo([LISTENER])).get(LISTENER);

        expect(info.isBusy).toBe(false);
    });

    it("reports a stale DB flag as free (not 'manual') and heals it in the background", async () => {
        User.findAll.mockResolvedValue([flags({ isBusy: true })]);
        redisService.getUserBusyStatus.mockResolvedValue(null);
        Chat.count.mockResolvedValue(0);
        mockCallRequest.count.mockResolvedValue(0);
        const io = { emit: jest.fn() };

        const info = (await conversationService.getBusyInfo([LISTENER], io)).get(LISTENER);
        await new Promise((resolve) => setImmediate(resolve));

        expect(info).toEqual({ isBusy: false, type: null, since: null });
        expect(User.update).toHaveBeenCalledWith({ isBusy: false }, { where: { id: LISTENER, isManualBusy: false } });
    });

    it("keeps a DB flag busy when a started chat backs it up", async () => {
        User.findAll.mockResolvedValue([flags({ isBusy: true })]);
        redisService.getUserBusyStatus.mockResolvedValue(null);
        Chat.count.mockResolvedValue(1);

        const info = (await conversationService.getBusyInfo([LISTENER])).get(LISTENER);

        expect(info.isBusy).toBe(true);
        expect(User.update).not.toHaveBeenCalled();
    });
});

describe("findStartConflict", () => {
    it("blocks starting with a listener who is in do-not-disturb, but not the user starting it", async () => {
        User.findByPk.mockImplementation(async (id) => flags({ id, isManualBusy: id === LISTENER }));

        const conflict = await conversationService.findStartConflict(CHAT, [USER, LISTENER], USER);
        expect(conflict).toEqual({ userId: LISTENER, reason: "manual" });

        const selfStart = await conversationService.findStartConflict(CHAT, [USER, LISTENER], LISTENER);
        expect(selfStart).toBeNull();
    });

    it("blocks when a participant has a started chat elsewhere", async () => {
        Chat.count.mockResolvedValue(1);

        const conflict = await conversationService.findStartConflict(CHAT, [USER, LISTENER], USER);

        expect(conflict).toEqual({ userId: USER, reason: "session" });
    });

    it("ignores flags that belong to this conversation's own request", async () => {
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: CHAT, type: "chat" });

        expect(await conversationService.findStartConflict(CHAT, [USER, LISTENER], USER)).toBeNull();
    });

    it("heals a stale flag from another conversation instead of blocking", async () => {
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: "old-chat" });
        mockCallRequest.count.mockResolvedValue(0);

        expect(await conversationService.findStartConflict(CHAT, [LISTENER], USER)).toBeNull();
        expect(redisService.clearUserBusyStatus).toHaveBeenCalledWith(LISTENER);
    });
});

describe("isUserTrulyBusy request age limits", () => {
    it("ignores pending/accepted requests that are older than they can legitimately be", async () => {
        mockCallRequest.count.mockResolvedValue(0);

        const result = await conversationService.isUserTrulyBusy(LISTENER);

        expect(result).toEqual({ status: "NOT_BUSY" });
        const where = mockCallRequest.count.mock.calls[0][0].where;
        const [participantClause, stateClause] = where[Op.and];
        expect(participantClause[Op.or]).toEqual([{ senderId: LISTENER }, { receiverId: LISTENER }]);

        const [pending, accepted] = stateClause[Op.or];
        expect(pending.status).toBe("pending");
        expect(accepted.status).toBe("accepted");
        const pendingCutoff = pending.requestTimestamp[Op.gt].getTime();
        const acceptedCutoff = accepted.acceptanceTimestamp[Op.gt].getTime();
        expect(Date.now() - pendingCutoff).toBeGreaterThanOrEqual(2 * 60 * 1000 - 100);
        // A running session is caught by its started chat; an accepted request only covers the
        // 30s join / 60s first-message window, so it stops counting after 2 minutes.
        expect(Date.now() - acceptedCutoff).toBeGreaterThanOrEqual(2 * 60 * 1000 - 100);
        expect(Date.now() - acceptedCutoff).toBeLessThan(3 * 60 * 1000);
    });

    it("still reports busy while a request is within its window", async () => {
        Chat.count.mockResolvedValue(0);
        mockCallRequest.count.mockResolvedValue(1);

        expect(await conversationService.isUserTrulyBusy(LISTENER)).toEqual({ status: "BUSY" });
    });

    it("still reports busy when a chat is started", async () => {
        Chat.count.mockResolvedValue(1);

        expect(await conversationService.isUserTrulyBusy(LISTENER)).toEqual({ status: "BUSY" });
        expect(mockCallRequest.count).not.toHaveBeenCalled();
    });
});
