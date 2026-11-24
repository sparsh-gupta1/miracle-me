jest.mock("../../../src/models", () => ({
    User: { findByPk: jest.fn(), update: jest.fn().mockResolvedValue() },
    Chat: { findByPk: jest.fn() },
}));

jest.mock("../../../src/services/chat.service", () => ({
    sendMessage: jest.fn(),
}));
jest.mock("../../../src/services/redis.service", () => ({
    isUserReachable: jest.fn().mockResolvedValue(true),
    isUserActiveInChat: jest.fn().mockResolvedValue(false),
    acquireUserSessionLock: jest.fn().mockResolvedValue("lock"),
    getUserBusyStatus: jest.fn().mockResolvedValue(null),
    releaseUserSessionLock: jest.fn().mockResolvedValue(),
    setUserBusyStatus: jest.fn().mockResolvedValue(),
    setChatSessionActivity: jest.fn().mockResolvedValue(),
    getChatSessionPayerId: jest.fn(),
}));
jest.mock("../../../src/services/s3.service", () => ({}));
jest.mock("../../../src/services/penalty.service", () => ({
    startResponseWindow: jest.fn().mockResolvedValue(),
    registerResponse: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/conversation.service", () => ({
    isUserTrulyBusy: jest.fn(),
    startConversation: jest.fn(),
    markChatConnected: jest.fn(),
    resolvePayerEarner: jest.fn(() => ({ payerId: "user-1", earnerId: "listener-1" })),
}));
jest.mock("../../../src/services/chatSession.service", () => ({
    endChatSession: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/wallet.service", () => ({
    getWalletBalance: jest.fn().mockResolvedValue(0),
}));
jest.mock("../../../src/services/freeMinutes.service", () => ({
    getUserFreeMinutesUsage: jest.fn().mockResolvedValue({ remaining_seconds: 60 }),
}));
jest.mock("../../../src/constants/notification.constants", () => ({}));
jest.mock("../../../src/utils/CONSTANT", () => ({ roles: {} }));
jest.mock("../../../src/utils/audio-stream", () => ({
    convertIncomingAudioToStream: jest.fn(),
    generateRandomFilename: jest.fn(),
}));
jest.mock("../../../src/utils/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { User, Chat } = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");
const conversationService = require("../../../src/services/conversation.service");
const chatService = require("../../../src/services/chat.service");
const chatHandler = require("../../../src/websocket/handlers/chat.handler");

const ROLES = { "user-1": "user", "listener-1": "listener" };

const setup = (senderId, chatStatus) => {
    jest.clearAllMocks();
    User.findByPk.mockImplementation(async (id) => ({ id, role: ROLES[id], isBusy: false, isManualBusy: false }));
    Chat.findByPk.mockResolvedValue({
        id: "chat-1",
        status: chatStatus,
        participant1Id: "listener-1",
        participant2Id: "user-1",
    });
    redisService.getChatSessionPayerId.mockResolvedValue("user-1");
    conversationService.startConversation.mockResolvedValue({ payerId: "user-1" });
    chatService.sendMessage.mockResolvedValue({
        id: "msg-1",
        chatId: "chat-1",
        senderId,
        content: "hi",
        messageType: "text",
        sender: { name: "Sender" },
    });

    const emits = [];
    const io = {
        in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([]) })),
        emit: jest.fn(),
        to: jest.fn((rooms) => ({ emit: (event, payload) => emits.push({ rooms, event, payload }) })),
    };
    const handlers = {};
    const socket = {
        user: { id: senderId, role: ROLES[senderId] },
        on: jest.fn((event, callback) => { handlers[event] = callback; }),
        emit: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
    chatHandler(io, socket);
    const send = () => handlers["send-message"]({
        chatId: "chat-1",
        receiverId: senderId === "user-1" ? "listener-1" : "user-1",
        content: "hi",
    });
    const connectedEmits = () => emits.filter((e) => e.event === "chat-session-connected");
    return { send, socket, connectedEmits };
};

describe("send-message: chat billing starts at the listener's first reply", () => {
    it("opens the session unconnected when the user sends the first message", async () => {
        const { send, connectedEmits } = setup("user-1", "created");

        await send();

        expect(conversationService.startConversation).toHaveBeenCalledWith(
            "chat-1", false, "user-1", "chat", expect.anything(), { awaitingReply: true }
        );
        expect(conversationService.markChatConnected).not.toHaveBeenCalled();
        expect(connectedEmits()).toHaveLength(0);
    });

    it("connects immediately when the listener sends the first message", async () => {
        const { send, connectedEmits } = setup("listener-1", "created");
        conversationService.markChatConnected.mockResolvedValue(true);

        await send();

        expect(conversationService.markChatConnected).toHaveBeenCalledWith("chat-1");
        expect(connectedEmits()).toHaveLength(1);
        expect(connectedEmits()[0].rooms).toEqual(["chat:chat-1", "user:listener-1", "user:user-1"]);
    });

    it("connects on the listener's reply to a started chat and announces it once", async () => {
        const first = setup("listener-1", "started");
        conversationService.markChatConnected.mockResolvedValue(true);
        await first.send();
        expect(conversationService.markChatConnected).toHaveBeenCalledWith("chat-1");
        expect(first.connectedEmits()).toHaveLength(1);

        const second = setup("listener-1", "started");
        conversationService.markChatConnected.mockResolvedValue(false);
        await second.send();
        expect(second.connectedEmits()).toHaveLength(0);
    });

    it("does not connect when the paying user keeps messaging", async () => {
        const { send, connectedEmits } = setup("user-1", "started");

        await send();

        expect(conversationService.markChatConnected).not.toHaveBeenCalled();
        expect(connectedEmits()).toHaveLength(0);
    });

    it("still delivers the message if connecting fails", async () => {
        const { send, socket } = setup("listener-1", "started");
        conversationService.markChatConnected.mockRejectedValue(new Error("db down"));

        await send();

        expect(chatService.sendMessage).toHaveBeenCalled();
        expect(socket.emit).not.toHaveBeenCalledWith("error", expect.anything());
    });
});
