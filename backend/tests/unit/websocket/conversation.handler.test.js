jest.mock("../../../src/services/conversation.service", () => ({
    createConversation: jest.fn(),
    validateBalanceAndCalculateDuration: jest.fn(),
    startConversation: jest.fn(),
    endConversation: jest.fn(),
    getConversationDetails: jest.fn(),
    getActiveConversations: jest.fn(),
}));

jest.mock("../../../src/utils/logger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const conversationService = require("../../../src/services/conversation.service");
const logger = require("../../../src/utils/logger");
const conversationHandler = require("../../../src/websocket/handlers/conversation.handler");

const PARTICIPANT_ID = "participant-1";
const OTHER_PARTICIPANT_ID = "participant-2";
const CHAT_ID = "chat-1";

const createSocket = (userId) => {
    const handlers = {};
    return {
        user: { id: userId },
        handlers,
        on: jest.fn((event, callback) => { handlers[event] = callback; }),
        emit: jest.fn(),
        leave: jest.fn(),
        join: jest.fn(),
    };
};

describe("conversation:end authorization and audit metadata", () => {
    let io;

    beforeEach(() => {
        jest.clearAllMocks();
        io = { to: jest.fn(() => ({ emit: jest.fn() })), in: jest.fn(() => ({ socketsLeave: jest.fn() })) };
    });

    it("rejects a non-participant without ending the chat", async () => {
        const chat = {
            id: CHAT_ID,
            participant1Id: PARTICIPANT_ID,
            participant2Id: OTHER_PARTICIPANT_ID,
            status: "started",
        };
        conversationService.getConversationDetails.mockResolvedValue(chat);
        const socket = createSocket("intruder-1");
        conversationHandler(io, socket);

        await socket.handlers["conversation:end"]({ conversationId: CHAT_ID });

        expect(chat.status).toBe("started");
        expect(conversationService.endConversation).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith("conversation:end:error", {
            message: "You are not a participant in this conversation",
        });
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(
            `chatId=${CHAT_ID} attemptedByUserId=intruder-1`
        ));
    });

    it("ends a participant's chat and records the authenticated actor", async () => {
        const chat = {
            id: CHAT_ID,
            participant1Id: PARTICIPANT_ID,
            participant2Id: OTHER_PARTICIPANT_ID,
            status: "started",
        };
        const endedConversation = { ...chat, status: "ended", durationSeconds: 12 };
        conversationService.getConversationDetails.mockResolvedValue(chat);
        conversationService.endConversation.mockResolvedValue({ conversation: endedConversation, billing: null });
        const socket = createSocket(PARTICIPANT_ID);
        conversationHandler(io, socket);

        await socket.handlers["conversation:end"]({ conversationId: CHAT_ID });

        expect(conversationService.endConversation).toHaveBeenCalledWith(CHAT_ID, {
            io,
            reason: "manual",
            triggeredByUserId: PARTICIPANT_ID,
            source: "conversation:end socket",
        });
        expect(socket.emit).toHaveBeenCalledWith("conversation:end_res", {
            success: true,
            result: { conversation: endedConversation, billing: null },
        });
    });
});