jest.mock("../../../src/models", () => ({
    User: { findByPk: jest.fn() },
    Chat: { findByPk: jest.fn() },
}));

jest.mock("../../../src/services/chat.service", () => ({
    sendMessage: jest.fn(),
}));
jest.mock("../../../src/services/redis.service", () => ({
    isUserReachable: jest.fn().mockResolvedValue(true),
    isUserActiveInChat: jest.fn().mockResolvedValue(false),
    acquireUserSessionLock: jest.fn(),
    getUserBusyStatus: jest.fn().mockResolvedValue(null),
    releaseUserSessionLock: jest.fn().mockResolvedValue(),
    setChatSessionActivity: jest.fn().mockResolvedValue(),
    getChatSessionPayerId: jest.fn().mockResolvedValue("payer-1"),
}));
jest.mock("../../../src/services/s3.service", () => ({}));
jest.mock("../../../src/services/penalty.service", () => ({
    startResponseWindow: jest.fn().mockResolvedValue(),
    registerResponse: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/conversation.service", () => ({
    isUserTrulyBusy: jest.fn(),
    resolvePayerEarner: jest.fn(({ participant1, participant2 }) => {
        if (participant1?.role === "user" && participant2?.role !== "user") {
            return { payerId: participant1.id, earnerId: participant2.id };
        }
        if (participant2?.role === "user" && participant1?.role !== "user") {
            return { payerId: participant2.id, earnerId: participant1.id };
        }
        return null;
    }),
}));
jest.mock("../../../src/services/chatSession.service", () => ({
    endChatSession: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/services/wallet.service", () => ({
    getWalletBalance: jest.fn().mockResolvedValue(0),
}));
jest.mock("../../../src/services/freeMinutes.service", () => ({
    getUserFreeMinutesUsage: jest.fn().mockResolvedValue({ remaining_seconds: 0 }),
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
const chatSessionService = require("../../../src/services/chatSession.service");
const chatService = require("../../../src/services/chat.service");
const walletService = require("../../../src/services/wallet.service");
const chatHandler = require("../../../src/websocket/handlers/chat.handler");

describe("send-message balance ending metadata", () => {
    it("passes balance reason and source to chat session ending", async () => {
        jest.clearAllMocks();
        User.findByPk.mockImplementation(async (id) => ({
            id,
            role: id === "payer-1" ? "user" : "listener",
            isBusy: false,
        }));
        Chat.findByPk.mockResolvedValue({
            id: "chat-1",
            status: "started",
            participant1Id: "payer-1",
            participant2Id: "listener-1",
        });
        redisService.acquireUserSessionLock
            .mockResolvedValueOnce("payer-lock")
            .mockResolvedValueOnce("listener-lock");

        const handlers = {};
        const socket = {
            user: { id: "payer-1", role: "user" },
            on: jest.fn((event, callback) => { handlers[event] = callback; }),
            emit: jest.fn(),
        };
        const io = {
            in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([]) })),
            emit: jest.fn(),
            to: jest.fn(() => ({ emit: jest.fn() })),
        };
        chatHandler(io, socket);

        await handlers["send-message"]({
            chatId: "chat-1",
            receiverId: "listener-1",
            content: "hello",
        });

        expect(chatSessionService.endChatSession).toHaveBeenCalledWith(
            "chat-1",
            io,
            "balance_exhausted",
            "chat.handler.balanceCheck",
            "payer-1"
        );
    });

    describe("when the stored payer has expired", () => {
        const setup = (roles, senderId) => {
            jest.clearAllMocks();
            redisService.getChatSessionPayerId.mockResolvedValue(null);
            User.findByPk.mockImplementation(async (id) => ({ id, role: roles[id], isBusy: false }));
            Chat.findByPk.mockResolvedValue({
                id: "chat-1",
                status: "started",
                participant1Id: Object.keys(roles)[0],
                participant2Id: Object.keys(roles)[1],
            });
            chatService.sendMessage.mockResolvedValue({
                id: "msg-1",
                chatId: "chat-1",
                senderId,
                content: "hi",
                messageType: "text",
                sender: { name: "Sender" },
            });

            const handlers = {};
            const socket = {
                user: { id: senderId, role: roles[senderId] },
                on: jest.fn((event, callback) => { handlers[event] = callback; }),
                emit: jest.fn(),
                to: jest.fn(() => ({ emit: jest.fn() })),
            };
            const io = {
                in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([]) })),
                emit: jest.fn(),
                to: jest.fn(() => ({ emit: jest.fn() })),
            };
            chatHandler(io, socket);
            return { handlers, socket };
        };

        it("bills the user participant, not the listener who sent the message", async () => {
            const { handlers, socket } = setup({ "user-1": "user", "listener-1": "listener" }, "listener-1");
            walletService.getWalletBalance.mockResolvedValue(100);

            await handlers["send-message"]({ chatId: "chat-1", receiverId: "user-1", content: "hi" });

            expect(walletService.getWalletBalance).toHaveBeenCalledWith("user-1");
            expect(walletService.getWalletBalance).not.toHaveBeenCalledWith("listener-1");
            expect(redisService.setChatSessionActivity).toHaveBeenCalledWith("chat-1", "user-1");
            expect(chatSessionService.endChatSession).not.toHaveBeenCalled();
            expect(chatService.sendMessage).toHaveBeenCalled();
            expect(socket.emit).not.toHaveBeenCalledWith("error", expect.anything());
        });

        it("skips the balance check for an unbilled peer chat", async () => {
            const { handlers, socket } = setup({ "listener-1": "listener", "listener-2": "listener" }, "listener-1");

            await handlers["send-message"]({ chatId: "chat-1", receiverId: "listener-2", content: "hi" });

            expect(walletService.getWalletBalance).not.toHaveBeenCalled();
            expect(chatSessionService.endChatSession).not.toHaveBeenCalled();
            expect(chatService.sendMessage).toHaveBeenCalled();
            expect(socket.emit).not.toHaveBeenCalledWith("error", expect.anything());
        });

        it("reports a send failure with an error code, not the raw error", async () => {
            const { handlers, socket } = setup({ "user-1": "user", "listener-1": "listener" }, "listener-1");
            walletService.getWalletBalance.mockResolvedValue(100);
            chatService.sendMessage.mockRejectedValue(new Error("connection reset"));

            await handlers["send-message"]({ chatId: "chat-1", receiverId: "user-1", content: "hi" });

            expect(socket.emit).toHaveBeenCalledWith("error", {
                message: "Failed to send message",
                error_code: "SEND_MESSAGE_FAILED",
            });
        });
    });
});
