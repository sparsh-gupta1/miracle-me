jest.mock("../../../src/services/conversation.service", () => ({
    endConversation: jest.fn().mockResolvedValue({
        conversation: { id: "conversation-1", durationSeconds: 90, serviceType: "video_call" },
        billing: null,
    }),
}));

const callDurationMonitor = require("../../../src/services/callDurationMonitor.service");
const conversationService = require("../../../src/services/conversation.service");

describe("call duration end audit metadata", () => {
    it("marks affordable-duration termination with its specific reason and source", async () => {
        jest.clearAllMocks();
        jest.spyOn(callDurationMonitor, "stopMonitoring").mockResolvedValue(5);
        const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

        await callDurationMonitor._terminateCall(
            "call-1",
            "conversation-1",
            "payer-1",
            "earner-1",
            90,
            io
        );

        expect(conversationService.endConversation).toHaveBeenCalledWith("conversation-1", {
            payerId: "payer-1",
            pausedSeconds: 5,
            io,
            reason: "call_duration_limit",
            source: "callDurationMonitor._terminateCall",
        });
    });
});