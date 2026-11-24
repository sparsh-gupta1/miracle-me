const mockRedisClient = {
    hSet: jest.fn().mockResolvedValue(),
    hGet: jest.fn().mockResolvedValue("sent"),
    hGetAll: jest.fn().mockResolvedValue({}),
    set: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(),
};

jest.mock("../../../src/models", () => ({
    User: {
        findByPk: jest.fn(),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(),
    },
    CallRequest: { findByPk: jest.fn() },
    Chat: { findOne: jest.fn().mockResolvedValue(null), findByPk: jest.fn() },
}));
jest.mock("../../../src/services/chatRequest.service.js", () => ({
    sendCallRequest: jest.fn().mockResolvedValue({ success: true, request_id: "req-1" }),
    acceptCallRequest: jest.fn(),
    rejectCallRequest: jest.fn(),
    cancelCallRequest: jest.fn(),
    missedCallRequest: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../../../src/services/chat.service.js", () => ({
    getOrCreateChat: jest.fn().mockResolvedValue({ id: "chat-1" }),
}));
jest.mock("../../../src/services/conversation.service.js", () => ({
    normalizeServiceType: jest.fn((t) => t),
    validateBalanceAndCalculateDuration: jest.fn().mockResolvedValue({ hasSufficientBalance: true }),
    createConversation: jest.fn().mockResolvedValue({ id: "conv-1" }),
    isUserTrulyBusy: jest.fn(),
    releaseBusyForSession: jest.fn().mockResolvedValue({ freed: [] }),
    getBusyInfo: jest.fn().mockResolvedValue(new Map()),
    releaseUnstartedRequestState: jest.fn().mockResolvedValue({ freed: [] }),
}));
jest.mock("../../../src/services/redis.service.js", () => ({
    client: mockRedisClient,
    getUserStatus: jest.fn().mockResolvedValue({ isOnline: true }),
    acquireUserSessionLock: jest.fn().mockResolvedValue("lock"),
    releaseUserSessionLock: jest.fn().mockResolvedValue(),
    getUserBusyStatus: jest.fn().mockResolvedValue(null),
    clearUserBusyStatus: jest.fn().mockResolvedValue(),
    setUserBusyStatus: jest.fn().mockResolvedValue(),
    setUserActiveInChat: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/callDurationMonitor.service.js", () => ({
    recordActivity: jest.fn(),
}));
jest.mock("../../../src/services/callLifecycle.service.js", () => ({
    endCall: jest.fn().mockResolvedValue(),
    endCallForAll: jest.fn().mockResolvedValue(),
    markConnected: jest.fn().mockResolvedValue(),
    markDisconnected: jest.fn().mockResolvedValue(),
}));
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
jest.mock("../../../src/utils/logger.js", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { User, CallRequest, Chat } = require("../../../src/models");
const conversationService = require("../../../src/services/conversation.service.js");
const CallRequestService = require("../../../src/services/chatRequest.service.js");
const callLifecycle = require("../../../src/services/callLifecycle.service.js");
const redisService = require("../../../src/services/redis.service.js");
const callRequestHandler = require("../../../src/websocket/handlers/callRequest.handler.js");

const CALLER = "caller-1";
const RECEIVER = "receiver-1";
const REQ = "req-1";
const CONV = "conv-1";

function connect(userId, role = "user") {
    const handlers = {};
    const socket = {
        id: `socket-${userId}`,
        user: { id: userId, role },
        on: jest.fn((event, cb) => { handlers[event] = cb; }),
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
    };
    const roomEmits = [];
    const io = {
        in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([{}]) })),
        to: jest.fn((room) => ({ emit: (event, payload) => roomEmits.push([room, event, payload]) })),
        emit: jest.fn(),
    };
    callRequestHandler(io, socket);
    return { handlers, socket, io, roomEmits };
}

const ringingCall = (overrides = {}) => ({
    conversationId: CONV,
    senderId: CALLER,
    receiverId: RECEIVER,
    status: "sent",
    serviceType: "video_call",
    ...overrides,
});

describe("call ringing teardown (reject / cancel / call-end)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        redisService.client.hGetAll.mockResolvedValue(ringingCall());
    });

    it("reject: only succeeds for the receiver and frees BOTH participants", async () => {
        CallRequestService.rejectCallRequest.mockResolvedValue({ success: true, senderId: CALLER, receiverId: RECEIVER });
        const { handlers, roomEmits, io } = connect(RECEIVER);

        await handlers["call-request:reject"]({ request_id: REQ });

        expect(CallRequestService.rejectCallRequest).toHaveBeenCalledWith(REQ, RECEIVER);
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith({
            conversationId: CONV,
            userIds: [CALLER, RECEIVER],
            io,
        });
        expect(roomEmits).toContainEqual([`user:${CALLER}`, "call-request:rejected", { request_id: REQ }]);
    });

    it("reject by someone who is not the receiver changes nothing", async () => {
        CallRequestService.rejectCallRequest.mockResolvedValue({ success: false, message: "Only the receiving user can reject this call" });
        const { handlers, socket } = connect("intruder");

        await handlers["call-request:reject"]({ request_id: REQ });

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", { message: "Only the receiving user can reject this call" });
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
        expect(redisService.client.del).not.toHaveBeenCalled();
    });

    it("cancel: frees the CALLER (not just the emitter) and the receiver, and notifies the receiver", async () => {
        CallRequestService.cancelCallRequest.mockResolvedValue({ success: true, senderId: CALLER, receiverId: RECEIVER });
        const { handlers, roomEmits } = connect(CALLER, "listener");

        await handlers["call-request:cancel"]({ request_id: REQ });

        expect(CallRequestService.cancelCallRequest).toHaveBeenCalledWith(REQ, { senderId: CALLER });
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith(
            expect.objectContaining({ conversationId: CONV, userIds: [CALLER, RECEIVER] })
        );
        expect(roomEmits).toContainEqual([`user:${RECEIVER}`, "call-ended", { request_id: REQ, sender_id: CALLER, reason: "cancelled" }]);
    });

    it("cancel by the receiver or after the call was accepted is refused and leaves state alone", async () => {
        CallRequestService.cancelCallRequest.mockResolvedValue({ success: false, alreadyHandled: true, message: "Call request is already accepted" });
        const { handlers, socket } = connect(CALLER);

        await handlers["call-request:cancel"]({ request_id: REQ });

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", { message: "Call request is already accepted" });
        expect(redisService.client.del).not.toHaveBeenCalled();
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
    });

    it("call-end by the caller while still ringing cancels the request instead of ending a conversation", async () => {
        CallRequestService.cancelCallRequest.mockResolvedValue({ success: true, senderId: CALLER, receiverId: RECEIVER });
        const { handlers } = connect(CALLER);

        await handlers["call-end"]({ request_id: REQ, receiver_id: RECEIVER });

        expect(CallRequestService.cancelCallRequest).toHaveBeenCalledWith(REQ, { senderId: CALLER });
        expect(callLifecycle.endCall).not.toHaveBeenCalled();
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith(
            expect.objectContaining({ userIds: [CALLER, RECEIVER] })
        );
    });

    it("call-end by the receiver while ringing rejects the request", async () => {
        CallRequestService.rejectCallRequest.mockResolvedValue({ success: true, senderId: CALLER, receiverId: RECEIVER });
        const { handlers } = connect(RECEIVER);

        await handlers["call-end"]({ request_id: REQ });

        expect(CallRequestService.rejectCallRequest).toHaveBeenCalledWith(REQ, RECEIVER);
        expect(callLifecycle.endCall).not.toHaveBeenCalled();
    });

    it("call-end by a non-participant is rejected and tells nobody", async () => {
        const { handlers, socket, roomEmits } = connect("intruder");

        await handlers["call-end"]({ request_id: REQ, receiver_id: "victim" });

        expect(socket.emit).toHaveBeenCalledWith("call-error", expect.any(Object));
        expect(callLifecycle.endCall).not.toHaveBeenCalled();
        expect(roomEmits).toEqual([]);
    });

    it("call-end on a started call ends it for both from the stored record, ignoring the client-supplied receiver_id", async () => {
        redisService.client.hGetAll.mockResolvedValue(ringingCall({ status: "started" }));
        const { handlers, roomEmits } = connect(CALLER);

        await handlers["call-end"]({ request_id: REQ, receiver_id: "someone-else" });

        // endCallForAll ends the call and tells both stored participants to leave the room.
        expect(callLifecycle.endCallForAll).toHaveBeenCalledWith(REQ, CALLER, "user_ended", expect.objectContaining({ status: "started" }));
        expect(roomEmits.some(([room]) => room === "user:someone-else")).toBe(false);
    });
});

describe("call-request:accept", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        redisService.client.hGetAll.mockResolvedValue(ringingCall());
    });

    it("surfaces the loser of an accept race as an error without touching call state", async () => {
        CallRequestService.acceptCallRequest.mockResolvedValue({ success: false, alreadyHandled: true, message: "Call request is already accepted" });
        const { handlers, socket } = connect(RECEIVER);

        await handlers["call-request:accept"]({ request_id: REQ });

        expect(socket.emit).toHaveBeenCalledWith("call-request:error", { message: "Call request is already accepted" });
        expect(redisService.client.hSet).not.toHaveBeenCalled();
        expect(callLifecycle.endCall).not.toHaveBeenCalled();
    });

    it("tears the call down when it fails after winning the accept, so users are not left busy", async () => {
        CallRequestService.acceptCallRequest.mockResolvedValue({ success: true, senderId: CALLER });
        redisService.client.hSet.mockRejectedValueOnce(new Error("redis down"));
        const { handlers, socket, roomEmits } = connect(RECEIVER);

        await handlers["call-request:accept"]({ request_id: REQ });

        expect(callLifecycle.endCall).toHaveBeenCalledWith(REQ, expect.objectContaining({ conversationId: CONV }), "accept_failed");
        expect(roomEmits).toContainEqual([`user:${CALLER}`, "call-ended", { request_id: REQ, reason: "accept_failed" }]);
        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.any(Object));
    });
});

describe("30s ring timeout racing an accept", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        User.findByPk.mockImplementation(async (id) => ({ id, name: id, role: id === CALLER ? "listener" : "user" }));
        redisService.client.hGet.mockResolvedValue("sent");
    });

    afterEach(() => jest.useRealTimers());

    it("leaves the live call alone when the request was accepted while the timeout fired", async () => {
        CallRequestService.missedCallRequest.mockResolvedValue({ success: false, alreadyHandled: true, message: "Call request is already accepted" });
        const { handlers } = connect(CALLER, "listener");

        await handlers["call-request"]({ request_type: "video_call", receiver_id: RECEIVER });
        redisService.client.del.mockClear();
        conversationService.releaseBusyForSession.mockClear();

        await jest.advanceTimersByTimeAsync(30_500);

        expect(CallRequestService.missedCallRequest).toHaveBeenCalledWith(REQ);
        expect(redisService.client.del).not.toHaveBeenCalled();
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
    });

    it("cleans up and notifies both sides when the request really went unanswered", async () => {
        CallRequestService.missedCallRequest.mockResolvedValue({ success: true });
        const { handlers, roomEmits } = connect(CALLER, "listener");

        await handlers["call-request"]({ request_type: "video_call", receiver_id: RECEIVER });
        await jest.advanceTimersByTimeAsync(30_500);

        expect(redisService.client.del).toHaveBeenCalledWith(`call:${REQ}`);
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith(
            expect.objectContaining({ conversationId: "conv-1", userIds: [CALLER, RECEIVER] })
        );
        expect(roomEmits).toContainEqual([`user:${RECEIVER}`, "call-timeout", expect.objectContaining({ reason: "no_answer" })]);
        expect(roomEmits).toContainEqual([`user:${CALLER}`, "call-timeout", expect.objectContaining({ reason: "no_answer" })]);
    });
});

describe("accepted chat request with no first message", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        redisService.client.hGetAll.mockResolvedValue(ringingCall({ serviceType: "chat" }));
        CallRequestService.acceptCallRequest.mockResolvedValue({ success: true, senderId: CALLER });
    });

    afterEach(() => jest.useRealTimers());

    it("releases both users and tells them the request expired after 60s", async () => {
        CallRequest.findByPk.mockResolvedValue({ id: REQ, status: "accepted" });
        Chat.findByPk.mockResolvedValue({ id: CONV, status: "created" });
        const { handlers, roomEmits } = connect(RECEIVER, "listener");

        await handlers["call-request:accept"]({ request_id: REQ });
        await jest.advanceTimersByTimeAsync(59_000);
        expect(conversationService.releaseUnstartedRequestState).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1_500);

        expect(conversationService.releaseUnstartedRequestState).toHaveBeenCalledWith(CONV, [CALLER, RECEIVER], expect.anything());
        const expired = { request_id: REQ, chatId: "chat-1", reason: "no_first_message" };
        expect(roomEmits).toContainEqual([`user:${CALLER}`, "chat-request:expired", expired]);
        expect(roomEmits).toContainEqual([`user:${RECEIVER}`, "chat-request:expired", expired]);
        // Calls keep their own 30s Agora join timeout; this is chat-only.
        expect(callLifecycle.endCall).not.toHaveBeenCalled();
    });

    it("leaves the chat alone when it started within the 60s", async () => {
        CallRequest.findByPk.mockResolvedValue({ id: REQ, status: "accepted" });
        Chat.findByPk.mockResolvedValue({ id: CONV, status: "started" });
        const { handlers, roomEmits } = connect(RECEIVER, "listener");

        await handlers["call-request:accept"]({ request_id: REQ });
        await jest.advanceTimersByTimeAsync(61_000);

        expect(conversationService.releaseUnstartedRequestState).not.toHaveBeenCalled();
        expect(roomEmits.some(([, event]) => event === "chat-request:expired")).toBe(false);
    });

    it("does nothing when the request was already closed (e.g. the session ran and ended)", async () => {
        CallRequest.findByPk.mockResolvedValue({ id: REQ, status: "ended" });
        Chat.findByPk.mockResolvedValue({ id: CONV, status: "ended" });
        const { handlers } = connect(RECEIVER, "listener");

        await handlers["call-request:accept"]({ request_id: REQ });
        await jest.advanceTimersByTimeAsync(61_000);

        expect(conversationService.releaseUnstartedRequestState).not.toHaveBeenCalled();
    });
});
