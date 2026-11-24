jest.mock("../../../src/models", () => ({
    User: { findByPk: jest.fn() },
    Chat: { findByPk: jest.fn() },
}));

jest.mock("../../../src/services/chat.service", () => ({ sendMessage: jest.fn() }));
jest.mock("../../../src/services/redis.service", () => ({
    isUserReachable: jest.fn().mockResolvedValue(true),
    isUserActiveInChat: jest.fn().mockResolvedValue(false),
    acquireUserSessionLock: jest.fn(),
    getUserBusyStatus: jest.fn().mockResolvedValue(null),
    releaseUserSessionLock: jest.fn().mockResolvedValue(),
    setUserBusyStatus: jest.fn().mockResolvedValue(),
    setChatSessionActivity: jest.fn().mockResolvedValue(),
    getChatSessionPayerId: jest.fn().mockResolvedValue("payer-1"),
}));
jest.mock("../../../src/services/s3.service", () => ({}));
jest.mock("../../../src/services/penalty.service", () => ({}));
jest.mock("../../../src/services/conversation.service", () => ({
    isUserTrulyBusy: jest.fn(),
    startConversation: jest.fn(),
    releaseBusyForSession: jest.fn().mockResolvedValue({ freed: [] }),
    releaseUnstartedRequestState: jest.fn().mockResolvedValue({ freed: [] }),
    getActiveSessionFor: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../src/services/chatSession.service", () => ({ endChatSession: jest.fn().mockResolvedValue() }));
jest.mock("../../../src/services/wallet.service", () => ({ getWalletBalance: jest.fn().mockResolvedValue(100) }));
jest.mock("../../../src/services/freeMinutes.service", () => ({
    getUserFreeMinutesUsage: jest.fn().mockResolvedValue({ remaining_seconds: 0 }),
}));
jest.mock("../../../src/constants/notification.constants", () => ({}));
jest.mock("../../../src/utils/CONSTANT", () => ({ roles: {} }));
jest.mock("../../../src/utils/audio-stream", () => ({
    convertIncomingAudioToStream: jest.fn(),
    generateRandomFilename: jest.fn(),
}));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { User, Chat } = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");
const conversationService = require("../../../src/services/conversation.service");
const chatService = require("../../../src/services/chat.service");
const chatHandler = require("../../../src/websocket/handlers/chat.handler");

const SENDER = "user-1";
const LISTENER = "listener-1";
const CHAT = "chat-1";

function connect() {
    const handlers = {};
    const socket = {
        user: { id: SENDER, role: "user" },
        on: jest.fn((event, cb) => { handlers[event] = cb; }),
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
    const io = {
        in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([]) })),
        emit: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
    chatHandler(io, socket);
    return { handlers, socket, io };
}

const row = (id, extra = {}) => ({ id, role: id === LISTENER ? "listener" : "user", isBusy: false, isManualBusy: false, ...extra });
const message = { chatId: CHAT, receiverId: LISTENER, content: "hi" };
const busyBroadcasts = (io) =>
    io.emit.mock.calls.filter(([event, payload]) => event === "listener:status-changed" && payload.isBusy === true);

beforeEach(() => {
    jest.clearAllMocks();
    let n = 0;
    redisService.acquireUserSessionLock.mockImplementation(async (uid) => `lock-${uid}-${++n}`);
    redisService.getUserBusyStatus.mockResolvedValue(null);
    User.findByPk.mockImplementation(async (id) => row(id));
    Chat.findByPk.mockResolvedValue({ id: CHAT, status: "created", participant1Id: SENDER, participant2Id: LISTENER });
    conversationService.startConversation.mockResolvedValue({});
    chatService.sendMessage.mockRejectedValue(new Error("stop after guard"));
});

describe("send-message busy guard", () => {
    it("does not take per-message session locks in a chat that is already started", async () => {
        Chat.findByPk.mockResolvedValue({ id: CHAT, status: "started", participant1Id: SENDER, participant2Id: LISTENER });
        const { handlers } = connect();

        await handlers["send-message"](message);

        expect(redisService.acquireUserSessionLock).not.toHaveBeenCalled();
        expect(chatService.sendMessage).toHaveBeenCalled();
    });

    it("rejects a first message to a listener in do-not-disturb and never starts a session", async () => {
        User.findByPk.mockImplementation(async (id) => row(id, id === LISTENER ? { isBusy: true, isManualBusy: true } : {}));
        const { handlers, socket, io } = connect();

        await handlers["send-message"](message);

        expect(socket.emit).toHaveBeenCalledWith("error", expect.objectContaining({ error_code: "LISTENER_BUSY" }));
        expect(conversationService.startConversation).not.toHaveBeenCalled();
        expect(conversationService.isUserTrulyBusy).not.toHaveBeenCalled();
        expect(conversationService.releaseBusyForSession).not.toHaveBeenCalled();
        expect(busyBroadcasts(io)).toEqual([]);
        const released = redisService.releaseUserSessionLock.mock.calls.map(([uid]) => uid);
        expect(released).toEqual(expect.arrayContaining([SENDER, LISTENER]));
    });

    it("tells a sender who is chatting with someone else that *they* are busy, and never touches this listener", async () => {
        // The sender's busy hash belongs to their chat with another listener.
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === SENDER ? { conversationId: "chat-a" } : null));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "BUSY" });
        const activeSession = { chatId: "chat-a", peerId: "listener-a", peerName: "Asha", type: "chat", started: true, requestId: null };
        conversationService.getActiveSessionFor.mockResolvedValue(activeSession);
        const { handlers, socket, io } = connect();

        await handlers["send-message"](message);

        expect(socket.emit).toHaveBeenCalledWith("error", expect.objectContaining({
            error_code: "CALLER_IN_SESSION",
            activeSession,
        }));
        expect(conversationService.startConversation).not.toHaveBeenCalled();
        // The other listener is never checked, locked or broadcast as busy.
        expect(redisService.acquireUserSessionLock).not.toHaveBeenCalledWith(LISTENER, expect.anything(), expect.anything());
        expect(busyBroadcasts(io)).toEqual([]);
    });

    it("heals a stale flag through the shared helper and lets the message through", async () => {
        User.findByPk.mockImplementation(async (id) => row(id, id === LISTENER ? { isBusy: true } : {}));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "NOT_BUSY" });
        const { handlers, io } = connect();

        await handlers["send-message"](message);

        expect(conversationService.releaseBusyForSession).toHaveBeenCalledWith({ userIds: [LISTENER], io, force: true });
        expect(conversationService.startConversation).toHaveBeenCalled();
    });

    it("on lock contention releases the sender's lock, asks to retry, and broadcasts nothing", async () => {
        redisService.acquireUserSessionLock.mockImplementation(async (uid) => (uid === LISTENER ? null : `lock-${uid}`));
        const { handlers, socket, io } = connect();

        await handlers["send-message"](message);

        expect(socket.emit).toHaveBeenCalledWith("error", expect.objectContaining({ error_code: "TRY_AGAIN" }));
        expect(redisService.releaseUserSessionLock).toHaveBeenCalledWith(SENDER, `lock-${SENDER}`);
        expect(busyBroadcasts(io)).toEqual([]);
    });

    it("rejects a really busy listener without broadcasting a busy state", async () => {
        redisService.getUserBusyStatus.mockImplementation(async (id) => (id === LISTENER ? { conversationId: "other" } : null));
        conversationService.isUserTrulyBusy.mockResolvedValue({ status: "BUSY" });
        const { handlers, socket, io } = connect();

        await handlers["send-message"](message);

        expect(socket.emit).toHaveBeenCalledWith("error", expect.objectContaining({ error_code: "LISTENER_BUSY" }));
        expect(busyBroadcasts(io)).toEqual([]);
    });
});

describe("send-message when the session fails to start", () => {
    it("releases the request's busy state and both locks (e.g. insufficient balance)", async () => {
        conversationService.startConversation.mockRejectedValue(new Error("Insufficient balance"));
        const { handlers, socket, io } = connect();

        await handlers["send-message"](message);

        expect(socket.emit).toHaveBeenCalledWith("error", { message: "Insufficient balance" });
        expect(conversationService.releaseUnstartedRequestState).toHaveBeenCalledWith(CHAT, [SENDER, LISTENER], io);
        const released = redisService.releaseUserSessionLock.mock.calls.map(([uid]) => uid);
        expect(released).toEqual(expect.arrayContaining([SENDER, LISTENER]));
    });

    it("releases the session locks in finally when something throws after the guard", async () => {
        conversationService.startConversation.mockResolvedValue({});
        redisService.setUserBusyStatus.mockRejectedValue(new Error("redis down"));
        const { handlers } = connect();

        await handlers["send-message"](message);

        // setUserBusyStatus failed after a successful start; releaseUnstartedRequestState itself
        // refuses to touch a started chat, and the locks must still be freed.
        const released = redisService.releaseUserSessionLock.mock.calls.map(([uid]) => uid);
        expect(released).toEqual(expect.arrayContaining([SENDER, LISTENER]));
    });
});
