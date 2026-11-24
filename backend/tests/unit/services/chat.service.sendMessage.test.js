jest.mock("../../../src/models", () => ({
    Chat: { findOne: jest.fn(), update: jest.fn().mockResolvedValue() },
    Message: { create: jest.fn(), findByPk: jest.fn() },
    User: { findByPk: jest.fn() },
    ChatParticipant: { update: jest.fn().mockResolvedValue() },
    ChatSetting: {},
    UserFavorite: {},
}));
jest.mock("../../../src/services/redis.service", () => ({
    incrementUnreadCount: jest.fn(),
    cacheMessage: jest.fn(),
}));
jest.mock("../../../src/services/s3.service", () => ({}));
jest.mock("../../../src/utils/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { Chat, Message, User } = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");
const chatService = require("../../../src/services/chat.service");

describe("chatService.sendMessage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
        User.findByPk.mockImplementation(async (id) => ({
            id,
            role: id === "user-1" ? "user" : "listener",
        }));
        Chat.findOne.mockResolvedValue({ id: "chat-1" });
        Message.create.mockResolvedValue({
            id: "msg-1",
            isDelivered: false,
            isRead: false,
            save: jest.fn().mockResolvedValue(),
        });
        Message.findByPk.mockResolvedValue({ id: "msg-1", chatId: "chat-1" });
    });

    afterEach(() => {
        console.log.mockRestore();
    });

    it("still returns the stored message when the Redis side effects fail", async () => {
        redisService.incrementUnreadCount.mockRejectedValue(new Error("ECONNRESET"));
        redisService.cacheMessage.mockRejectedValue(new Error("ECONNRESET"));

        const message = await chatService.sendMessage("listener-1", "user-1", "hi", "text", {
            isReceiverOnline: true,
            isReceiverActiveInChat: false,
        });

        expect(message).toEqual({ id: "msg-1", chatId: "chat-1" });
        expect(Message.create).toHaveBeenCalled();
    });

    it("rejects an unsupported message type with a client-safe error", async () => {
        await expect(
            chatService.sendMessage("listener-1", "user-1", "hi", "sticker", {})
        ).rejects.toMatchObject({
            message: "Unsupported message type: sticker",
            isClientSafe: true,
        });
        expect(Message.create).not.toHaveBeenCalled();
    });
});
