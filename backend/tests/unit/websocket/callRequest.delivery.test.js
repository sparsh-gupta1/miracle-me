const mockRedisClient = {
    hSet: jest.fn().mockResolvedValue(),
    hGet: jest.fn().mockResolvedValue("sent"),
    set: jest.fn().mockResolvedValue(),
    del: jest.fn().mockResolvedValue(),
};

jest.mock("../../../src/models", () => ({
    User: { findByPk: jest.fn(), update: jest.fn().mockResolvedValue() },
    CallRequest: {},
    Chat: { findOne: jest.fn().mockResolvedValue(null) },
}));
jest.mock("../../../src/services/chatRequest.service.js", () => ({
    sendCallRequest: jest.fn().mockResolvedValue({ success: true, request_id: "req-1" }),
    missedCallRequest: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/chat.service.js", () => ({}));
jest.mock("../../../src/services/conversation.service.js", () => ({
    normalizeServiceType: jest.fn((t) => t),
    validateBalanceAndCalculateDuration: jest.fn().mockResolvedValue({ hasSufficientBalance: true }),
    createConversation: jest.fn().mockResolvedValue({ id: "conv-1" }),
    isUserTrulyBusy: jest.fn(),
    releaseBusyForSession: jest.fn().mockResolvedValue({ freed: [] }),
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
jest.mock("../../../src/services/callDurationMonitor.service.js", () => ({}));
jest.mock("../../../src/services/callLifecycle.service.js", () => ({}));
jest.mock("../../../src/services/agora.service.js", () => ({
    isConfigured: jest.fn().mockReturnValue(false),
    appId: "app-id",
}));
jest.mock("../../../src/services/push.service.js", () => ({
    sendIncomingCallNotification: jest.fn(),
    sendCancelCallNotification: jest.fn().mockResolvedValue(),
    sendMissedCallNotification: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/utils/logger.js", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { User } = require("../../../src/models");
const CallRequestService = require("../../../src/services/chatRequest.service.js");
const redisService = require("../../../src/services/redis.service.js");
const conversationService = require("../../../src/services/conversation.service.js");
const pushService = require("../../../src/services/push.service.js");
const callRequestHandler = require("../../../src/websocket/handlers/callRequest.handler.js");

const LISTENER_ID = "listener-1";
const USER_ID = "user-1";

function setup({ liveSockets }) {
    const handlers = {};
    const socket = {
        id: "socket-1",
        user: { id: LISTENER_ID, role: "listener" },
        on: jest.fn((event, cb) => { handlers[event] = cb; }),
        emit: jest.fn(),
    };
    const roomEmit = jest.fn();
    const io = {
        in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue(new Array(liveSockets).fill({})) })),
        to: jest.fn(() => ({ emit: roomEmit })),
        emit: jest.fn(),
    };
    callRequestHandler(io, socket);
    return { handlers, socket, io, roomEmit };
}

describe("call-request delivery to the receiving user", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        User.findByPk.mockImplementation(async (id) => {
            if (id === USER_ID) return { id: USER_ID, name: "Asha", role: "user", fcmToken: "tok", platform: "android" };
            if (id === LISTENER_ID) return { id: LISTENER_ID, name: "Ravi", role: "listener", isBusy: false };
            return null;
        });
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it("emits call-request-response to the canonical user room with the caller's real name", async () => {
        const { handlers, socket, io, roomEmit } = setup({ liveSockets: 1 });
        pushService.sendIncomingCallNotification.mockResolvedValue({ channel: "fcm", success: true });

        await handlers["call-request"]({ request_type: "video_call", receiver_id: USER_ID });

        expect(io.in).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(io.to).toHaveBeenCalledWith(`user:${USER_ID}`);
        expect(roomEmit).toHaveBeenCalledWith(
            "call-request-response",
            expect.objectContaining({ request_id: "req-1", request_type: "video_call", sender_name: "Ravi", senderId: LISTENER_ID })
        );
        expect(socket.emit).toHaveBeenCalledWith(
            "call-request:sent",
            expect.objectContaining({ delivery: { socket: 1, push: "async" } })
        );
    });

    it("keeps ringing when there is no live socket but the push succeeds", async () => {
        const { handlers, socket } = setup({ liveSockets: 0 });
        pushService.sendIncomingCallNotification.mockResolvedValue({ channel: "fcm", success: true });

        await handlers["call-request"]({ request_type: "video_call", receiver_id: USER_ID });

        expect(socket.emit).toHaveBeenCalledWith(
            "call-request:sent",
            expect.objectContaining({ delivery: { socket: 0, push: { channel: "fcm", success: true } } })
        );
        expect(socket.emit).not.toHaveBeenCalledWith("call-request:error", expect.anything());
    });

    it("cancels the call and frees both users when nothing can deliver it", async () => {
        const { handlers, socket } = setup({ liveSockets: 0 });
        pushService.sendIncomingCallNotification.mockResolvedValue({ channel: "none", success: false, reason: "no_fcm_token" });

        await handlers["call-request"]({ request_type: "video_call", receiver_id: USER_ID });

        expect(CallRequestService.missedCallRequest).toHaveBeenCalledWith("req-1");
        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith(
            expect.objectContaining({ conversationId: "conv-1", userIds: [LISTENER_ID, USER_ID] })
        );
        expect(socket.emit).toHaveBeenCalledWith("call-request:error", expect.objectContaining({ message: expect.any(String) }));
        expect(socket.emit).not.toHaveBeenCalledWith("call-request:sent", expect.anything());
    });
});
