const mockRedisClient = {
    hSet: jest.fn().mockResolvedValue(),
    hGet: jest.fn().mockResolvedValue("sent"),
    hGetAll: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(),
};

jest.mock("../../../src/models", () => ({
    User: { findByPk: jest.fn(), findOne: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue() },
    CallRequest: {},
    Chat: { findOne: jest.fn().mockResolvedValue(null) },
}));
jest.mock("../../../src/services/chatRequest.service.js", () => ({
    sendCallRequest: jest.fn().mockResolvedValue({ success: true, request_id: "req-1" }),
    cancelCallRequest: jest.fn().mockResolvedValue({ success: true }),
    missedCallRequest: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../../../src/services/chat.service.js", () => ({}));
jest.mock("../../../src/services/conversation.service.js", () => ({
    normalizeServiceType: jest.fn((t) => t),
    validateBalanceAndCalculateDuration: jest.fn().mockResolvedValue({ hasSufficientBalance: true }),
    createConversation: jest.fn().mockResolvedValue({ id: "conv-1" }),
    isUserTrulyBusy: jest.fn(),
    releaseBusyForSession: jest.fn().mockResolvedValue({ freed: [] }),
    getActiveSessionFor: jest.fn().mockResolvedValue(null),
    releaseUnstartedRequestState: jest.fn().mockResolvedValue({ freed: [] }),
}));
jest.mock("../../../src/services/redis.service.js", () => ({
    client: mockRedisClient,
    getUserStatus: jest.fn().mockResolvedValue({ isOnline: true }),
    acquireUserSessionLock: jest.fn(),
    releaseUserSessionLock: jest.fn().mockResolvedValue(),
    getUserBusyStatus: jest.fn().mockResolvedValue(null),
    clearUserBusyStatus: jest.fn().mockResolvedValue(),
    setUserBusyStatus: jest.fn().mockResolvedValue(),
    setUserActiveInChat: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/callDurationMonitor.service.js", () => ({ recordActivity: jest.fn() }));
jest.mock("../../../src/services/callLifecycle.service.js", () => ({}));
jest.mock("../../../src/services/agora.service.js", () => ({
    isConfigured: jest.fn().mockReturnValue(false),
    generateCallTokens: jest.fn().mockResolvedValue(null),
    appId: "app-id",
}));
jest.mock("../../../src/services/push.service.js", () => ({
    sendIncomingCallNotification: jest.fn().mockResolvedValue({ channel: "fcm", success: true }),
    sendCancelCallNotification: jest.fn().mockResolvedValue(),
    sendMissedCallNotification: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/utils/logger.js", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { User } = require("../../../src/models");
const CallRequestService = require("../../../src/services/chatRequest.service.js");
const conversationService = require("../../../src/services/conversation.service.js");
const agoraService = require("../../../src/services/agora.service.js");
const redisService = require("../../../src/services/redis.service.js");
const callRequestHandler = require("../../../src/websocket/handlers/callRequest.handler.js");

const CALLER = "user-1";
const LISTENER = "listener-1";

function connect() {
    const handlers = {};
    const socket = {
        id: "socket-1",
        user: { id: CALLER, role: "user" },
        on: jest.fn((event, cb) => { handlers[event] = cb; }),
        emit: jest.fn(),
    };
    const io = {
        in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([{}]) })),
        to: jest.fn(() => ({ emit: jest.fn() })),
        emit: jest.fn(),
    };
    callRequestHandler(io, socket);
    return { handlers, socket, io };
}

const busyBroadcasts = (io) =>
    io.emit.mock.calls.filter(([event, payload]) => event === "listener:status-changed" && payload.isBusy === true);

const userRow = (id, extra = {}) => ({ id, name: id, role: id === LISTENER ? "listener" : "user", isBusy: false, isManualBusy: false, ...extra });

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    let n = 0;
    redisService.acquireUserSessionLock.mockImplementation(async (uid) => `lock-${uid}-${++n}`);
    redisService.getUserBusyStatus.mockResolvedValue(null);
    conversationService.createConversation.mockResolvedValue({ id: "conv-1" });
    agoraService.isConfigured.mockReturnValue(false);
    User.findByPk.mockImplementation(async (id) => userRow(id));
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

const request = () => ({ request_type: "chat", receiver_id: LISTENER });

describe("call-request busy guard", () => {
    it("rejects a listener in manual do-not-disturb and does not heal or broadcast it", async () => {
        User.findByPk.mockImplementation(async (id) => userRow(id, id === LISTENER ? { isBusy: true, isManualBusy: true } : {}));
        const { handlers, socket, io } = connect();

        await handlers["call-request"](request());

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.objectContaining({ error_code: "LISTENER_BUSY" }));
        expect(conversationService.isUserTrulyBusy).not.toHaveBeenCalled();
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
        expect(CallRequestService.sendCallRequest).not.toHaveBeenCalled();
        expect(busyBroadcasts(io)).toEqual([]);
    });

    it("heals a stale DB flag through the shared helper (never manual) and lets the request through", async () => {
        User.findByPk.mockImplementation(async (id) => userRow(id, id === LISTENER ? { isBusy: true } : {}));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "NOT_BUSY" });
        const { handlers, socket, io } = connect();

        await handlers["call-request"](request());

        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith({ userIds: [LISTENER], io, force: true });
        expect(socket.emit).toHaveBeenCalledWith("call-request:sent", expect.anything());
    });

    it("rejects a really busy listener without broadcasting a (possibly wrong) busy state", async () => {
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === LISTENER ? { conversationId: "other", type: "chat" } : null));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "BUSY" });
        const { handlers, socket, io } = connect();

        await handlers["call-request"](request());

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.objectContaining({ error_code: "LISTENER_BUSY" }));
        expect(busyBroadcasts(io)).toEqual([]);
    });

    it("asks to retry (not 'listener busy') without broadcasting when the busy check itself fails", async () => {
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === LISTENER ? { conversationId: "other" } : null));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "CHECK_FAILED", error: new Error("db blip") });
        const { handlers, socket, io } = connect();

        await handlers["call-request"](request());

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.objectContaining({ error_code: "TRY_AGAIN" }));
        expect(busyBroadcasts(io)).toEqual([]);
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
    });

    it("on lock contention releases the caller's lock, asks to retry and broadcasts nothing", async () => {
        redisService.acquireUserSessionLock.mockImplementation(async (uid) => (uid === LISTENER ? null : `lock-${uid}`));
        const { handlers, socket, io } = connect();

        await handlers["call-request"](request());

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.objectContaining({ error_code: "TRY_AGAIN" }));
        expect(redisService.releaseUserSessionLock).toHaveBeenCalledWith(CALLER, `lock-${CALLER}`);
        expect(busyBroadcasts(io)).toEqual([]);
    });

    it("tells a caller who is in another session that *they* are busy, naming that session", async () => {
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === CALLER ? { conversationId: "chat-a" } : null));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "BUSY" });
        const activeSession = { chatId: "chat-a", peerId: "listener-a", peerName: "Asha", type: "chat", started: true, requestId: null };
        conversationService.getActiveSessionFor.mockResolvedValue(activeSession);
        const { handlers, socket } = connect();

        await handlers["call-request"](request());

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.objectContaining({
            error_code: "CALLER_IN_SESSION",
            activeSession,
        }));
        expect(conversationService.releaseUnstartedRequestState).not.toHaveBeenCalled();
        expect(CallRequestService.sendCallRequest).not.toHaveBeenCalled();
    });

    it("replaces the caller's own unstarted request with the same listener instead of rejecting", async () => {
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === CALLER ? { conversationId: "conv-1" } : null));
        conversationService.getActiveSessionFor.mockResolvedValue({
            chatId: "conv-1", peerId: LISTENER, peerName: "L", type: "chat", started: false, requestId: "old-req",
        });
        // Busy because of the old request; free once it has been released.
        conversationService.isUserTrulyBusy
            .mockResolvedValueOnce({ status: "BUSY" })
            .mockResolvedValue({ status: "NOT_BUSY" });
        const { handlers, socket } = connect();

        await handlers["call-request"]({ request_type: "audio_call", receiver_id: LISTENER });

        expect(conversationService.releaseUnstartedRequestState).toHaveBeenCalledWith("conv-1", [CALLER, LISTENER], expect.anything());
        expect(mockRedisClient.del).toHaveBeenCalledWith("call:old-req");
        expect(CallRequestService.sendCallRequest).toHaveBeenCalledWith(CALLER, LISTENER, "audio_call");
        expect(socket.emit).not.toHaveBeenCalledWith("call-request:error", expect.anything());
    });

    it("does not replace an unstarted request that is with a different listener", async () => {
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === CALLER ? { conversationId: "conv-x" } : null));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "BUSY" });
        conversationService.getActiveSessionFor.mockResolvedValue({
            chatId: "conv-x", peerId: "someone-else", peerName: "X", type: "chat", started: false, requestId: "req-x",
        });
        const { handlers, socket } = connect();

        await handlers["call-request"](request());

        expect(conversationService.releaseUnstartedRequestState).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.objectContaining({ error_code: "CALLER_IN_SESSION" }));
    });
});

describe("call-request failure cleanup", () => {
    it("a failure BEFORE busy was set clears no busy state and releases every lock", async () => {
        conversationService.createConversation.mockRejectedValue(new Error("db down"));
        const { handlers, socket } = connect();

        await handlers["call-request"](request());

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.any(Object));
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
        expect(redisService.clearUserBusyStatus).not.toHaveBeenCalled();
        const released = redisService.releaseUserSessionLock.mock.calls.map(([uid]) => uid);
        expect(released).toEqual(expect.arrayContaining([CALLER, LISTENER]));
    });

    it("a failure AFTER busy was set rolls back exactly that request", async () => {
        agoraService.isConfigured.mockReturnValue(true);
        agoraService.generateCallTokens.mockRejectedValue(new Error("agora down"));
        const { handlers, socket, io } = connect();

        await handlers["call-request"]({ request_type: "video_call", receiver_id: LISTENER });

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.any(Object));
        expect(redisService.client.del).toHaveBeenCalledWith("call:conv-1");
        expect(redisService.client.del).toHaveBeenCalledWith("call:req-1");
        expect(CallRequestService.cancelCallRequest).toHaveBeenCalledWith("req-1", { senderId: CALLER });
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith({
            conversationId: "conv-1", userIds: [CALLER, LISTENER], io,
        });
    });

    it("releases the session locks in finally when the guard itself throws", async () => {
        let call = 0;
        User.findByPk.mockImplementation(async (id) => {
            // 1st: receiver lookup, 2nd: caller lookup, 3rd: caller guard, 4th: receiver guard -> throw
            call += 1;
            if (call === 4) throw new Error("db blip");
            return userRow(id);
        });
        const { handlers, socket } = connect();

        await handlers["call-request"](request());

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.any(Object));
        const released = redisService.releaseUserSessionLock.mock.calls.map(([uid]) => uid);
        expect(released).toEqual(expect.arrayContaining([CALLER, LISTENER]));
    });
});
