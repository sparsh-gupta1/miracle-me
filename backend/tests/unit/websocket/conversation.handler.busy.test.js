jest.mock("../../../src/services/conversation.service", () => ({
    getConversationDetails: jest.fn(),
    findStartConflict: jest.fn(),
    startConversation: jest.fn(),
    endConversation: jest.fn(),
    getActiveSessionFor: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../src/services/redis.service", () => ({
    client: { hGetAll: jest.fn() },
    deleteChatSessionActivity: jest.fn(),
    removeUserFromActiveChat: jest.fn(),
}));
jest.mock("../../../src/services/callLifecycle.service", () => ({
    endCall: jest.fn(),
}));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const conversationService = require("../../../src/services/conversation.service");
const redisService = require("../../../src/services/redis.service");
const callLifecycle = require("../../../src/services/callLifecycle.service");
const conversationHandler = require("../../../src/websocket/handlers/conversation.handler");

const USER = "user-1";
const LISTENER = "listener-1";
const CHAT = "chat-1";
const chat = { id: CHAT, participant1Id: USER, participant2Id: LISTENER, status: "created" };

function connect(userId = USER) {
    const handlers = {};
    const socket = {
        user: { id: userId },
        on: jest.fn((event, cb) => { handlers[event] = cb; }),
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
    };
    // Record every (rooms, event, payload) so tests can check who was told.
    const emitted = [];
    const io = {
        to: jest.fn((rooms) => ({ emit: jest.fn((event, payload) => emitted.push({ rooms, event, payload })) })),
        in: jest.fn(() => ({ socketsLeave: jest.fn() })),
        emit: jest.fn(),
    };
    io.emitted = emitted;
    conversationHandler(io, socket);
    return { handlers, socket, io };
}

beforeEach(() => {
    jest.clearAllMocks();
    conversationService.getConversationDetails.mockResolvedValue(chat);
    conversationService.findStartConflict.mockResolvedValue(null);
    redisService.client.hGetAll.mockResolvedValue({});
});

describe("conversation:start busy rules", () => {
    it("refuses to start when a participant is in do-not-disturb or another session", async () => {
        conversationService.findStartConflict.mockResolvedValue({ userId: LISTENER, reason: "manual" });
        const { handlers, socket } = connect();

        await handlers["conversation:start"]({ conversationId: CHAT });

        expect(conversationService.findStartConflict).toHaveBeenCalledWith(CHAT, [USER, LISTENER], USER, expect.any(Object));
        expect(conversationService.startConversation).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith("conversation:error", expect.objectContaining({ error_code: "LISTENER_BUSY" }));
    });

    it("tells the starter that *they* are in another session instead of blaming the listener", async () => {
        conversationService.findStartConflict.mockResolvedValue({ userId: USER, reason: "session" });
        const activeSession = { chatId: "other-chat", peerId: "listener-2", peerName: "B", type: "chat", started: true, requestId: null };
        conversationService.getActiveSessionFor.mockResolvedValue(activeSession);
        const { handlers, socket } = connect();

        await handlers["conversation:start"]({ conversationId: CHAT });

        expect(conversationService.startConversation).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith("conversation:error", expect.objectContaining({
            error_code: "CALLER_IN_SESSION",
            activeSession,
        }));
    });

    it("passes io through so the busy broadcast actually reaches clients", async () => {
        conversationService.startConversation.mockResolvedValue({ conversation: { id: CHAT, status: "started" }, balanceInfo: null });
        const { handlers, io } = connect();

        await handlers["conversation:start"]({ conversationId: CHAT });

        expect(conversationService.startConversation).toHaveBeenCalledWith(CHAT, false, null, null, io);
    });
});

describe("conversation:end for a call", () => {
    it("ends it through the call lifecycle so the monitor and Redis call state are cleaned up", async () => {
        redisService.client.hGetAll.mockResolvedValue({ requestId: "req-1" });
        callLifecycle.endCall.mockResolvedValue({
            conversation: { id: CHAT, status: "ended", endedAt: new Date(), durationSeconds: 30, participant1Id: USER, participant2Id: LISTENER },
            billing: null,
        });
        const { handlers, socket } = connect();

        await handlers["conversation:end"]({ conversationId: CHAT });

        expect(callLifecycle.endCall).toHaveBeenCalledWith("req-1", null, "user_ended", USER);
        expect(conversationService.endConversation).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith("conversation:end_res", expect.objectContaining({ success: true }));
    });

    it("falls back to ending the row when the call state is already gone", async () => {
        redisService.client.hGetAll.mockResolvedValue({ requestId: "req-1" });
        callLifecycle.endCall.mockResolvedValue(undefined);
        conversationService.endConversation.mockResolvedValue({
            conversation: { id: CHAT, status: "ended", endedAt: new Date(), durationSeconds: 0 },
            billing: null,
        });
        const { handlers } = connect();

        await handlers["conversation:end"]({ conversationId: CHAT });

        expect(conversationService.endConversation).toHaveBeenCalledWith(
            CHAT, expect.objectContaining({ reason: "manual", triggeredByUserId: USER })
        );
    });

    it("ends a plain chat directly when there is no call state", async () => {
        conversationService.endConversation.mockResolvedValue({
            conversation: { id: CHAT, status: "ended", endedAt: new Date(), durationSeconds: 0 },
            billing: null,
        });
        const { handlers } = connect();

        await handlers["conversation:end"]({ conversationId: CHAT });

        expect(callLifecycle.endCall).not.toHaveBeenCalled();
        expect(conversationService.endConversation).toHaveBeenCalled();
    });
});

describe("conversation:end tells the other side", () => {
    const sentTo = (io, event) => io.emitted.filter((e) => e.event === event);
    const ended = { id: CHAT, status: "ended", endedAt: new Date(), durationSeconds: 40 };

    it("reaches both users' personal rooms for a chat and cleans up chat state", async () => {
        conversationService.endConversation.mockResolvedValue({ conversation: ended, billing: null });
        const { handlers, io } = connect(USER);

        await handlers["conversation:end"]({ conversationId: CHAT });

        for (const event of ["conversation:ended", "chat-session-ended"]) {
            const [emit] = sentTo(io, event);
            expect(emit.rooms).toEqual(expect.arrayContaining([`user:${USER}`, `user:${LISTENER}`, `chat:${CHAT}`]));
        }
        expect(sentTo(io, "chat-session-ended")[0].payload).toEqual(expect.objectContaining({ chatId: CHAT, reason: "manual" }));
        expect(sentTo(io, "call-ended")).toHaveLength(0);
        expect(redisService.deleteChatSessionActivity).toHaveBeenCalledWith(CHAT);
        expect(redisService.removeUserFromActiveChat).toHaveBeenCalledWith(USER, CHAT);
        expect(redisService.removeUserFromActiveChat).toHaveBeenCalledWith(LISTENER, CHAT);
        expect(io.in).toHaveBeenCalledWith(`conversation:${CHAT}`);
    });

    it("sends call-ended to both users for a call", async () => {
        redisService.client.hGetAll.mockResolvedValue({ requestId: "req-1" });
        callLifecycle.endCall.mockResolvedValue({ conversation: ended, billing: null });
        const { handlers, io } = connect(LISTENER);

        await handlers["conversation:end"]({ conversationId: CHAT });

        const [emit] = sentTo(io, "call-ended");
        expect(emit.rooms).toEqual(expect.arrayContaining([`user:${USER}`, `user:${LISTENER}`]));
        expect(emit.payload).toEqual({ request_id: "req-1", sender_id: LISTENER, reason: "user_ended", auto_leave: true });
        expect(sentTo(io, "chat-session-ended")).toHaveLength(0);
    });

    it("lets the listener leave a chat the user already ended", async () => {
        conversationService.endConversation.mockResolvedValue({ conversation: ended, billing: null });
        const { handlers, socket, io } = connect(LISTENER);

        await handlers["conversation:end"]({ conversationId: CHAT });

        expect(socket.emit).toHaveBeenCalledWith("conversation:end_res", expect.objectContaining({ success: true }));
        expect(sentTo(io, "conversation:ended")[0].rooms).toContain(`user:${LISTENER}`);
    });
});
