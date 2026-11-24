const mockSend = jest.fn();

jest.mock("../../../src/config/firebase-admin", () => ({
    admin: { messaging: () => ({ send: mockSend }) },
    initializeFirebase: jest.fn(),
}));
jest.mock("../../../src/models", () => ({ User: { update: jest.fn().mockResolvedValue() } }));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock("../../../src/constants/notification.constants", () => ({
    PUSH: { INCOMING_REQUEST: { TITLE: () => "t", BODY: () => "b" } },
}));

const { User } = require("../../../src/models");
const pushService = require("../../../src/services/push.service");

const payload = { requestId: "r1", requestType: "video_call", callType: "video_call", callerName: "Ravi", conversationId: "c1" };

describe("sendIncomingCallNotification result", () => {
    beforeEach(() => jest.clearAllMocks());

    it("reports success over fcm for android", async () => {
        mockSend.mockResolvedValue("msg-1");
        const res = await pushService.sendIncomingCallNotification({ id: "u1", platform: "android", fcmToken: "tok" }, payload);
        expect(res).toEqual({ channel: "fcm", success: true });
    });

    it("reports no_fcm_token when android has no token", async () => {
        const res = await pushService.sendIncomingCallNotification({ id: "u1", platform: "android" }, payload);
        expect(res).toEqual({ channel: "none", success: false, reason: "no_fcm_token" });
    });

    it("falls back to fcm for a null platform", async () => {
        mockSend.mockResolvedValue("msg-2");
        const res = await pushService.sendIncomingCallNotification({ id: "u1", platform: null, fcmToken: "tok" }, payload);
        expect(res.channel).toBe("fcm");
        expect(res.success).toBe(true);
    });

    it("clears a dead token and reports the failure", async () => {
        mockSend.mockRejectedValue(new Error("Requested entity was not found: registration-token-not-registered"));
        const res = await pushService.sendIncomingCallNotification({ id: "u1", platform: "android", fcmToken: "tok" }, payload);
        expect(res.success).toBe(false);
        expect(User.update).toHaveBeenCalledWith({ fcmToken: null }, { where: { id: "u1", fcmToken: "tok" } });
    });
});
