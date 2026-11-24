jest.mock("../../../src/services/agora.service", () => ({
    verifyNcsSignature: jest.fn().mockReturnValue(true),
}));
jest.mock("../../../src/services/callLifecycle.service", () => ({
    endCall: jest.fn().mockResolvedValue(),
    endCallForAll: jest.fn().mockResolvedValue(),
    markConnected: jest.fn().mockResolvedValue(),
    markDisconnected: jest.fn().mockResolvedValue(),
}));

const redisService = require("../../../src/services/redis.service"); // globally mocked in tests/setup.js
const callLifecycle = require("../../../src/services/callLifecycle.service");
const agoraWebhook = require("../../../src/controllers/agoraWebhook.controller");

const CHANNEL = "conv-1";
const REQ = "req-1";
const USER = "user-1";
const LISTENER = "listener-1";

function leaveEvent(reason) {
    const req = {
        headers: {},
        rawBody: "{}",
        body: { eventType: 104, payload: { channelName: CHANNEL, account: USER, reason } },
    };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    return agoraWebhook.handle(req, res);
}

beforeEach(() => {
    jest.clearAllMocks();
    redisService.client.hGetAll.mockResolvedValue({ requestId: REQ, senderId: USER, receiverId: LISTENER });
});

describe("Agora broadcaster leave (104)", () => {
    it("ends the call for both at once when the user quit on purpose", async () => {
        await leaveEvent(1);

        expect(callLifecycle.endCallForAll).toHaveBeenCalledWith(REQ, USER, "peer_left");
        expect(callLifecycle.markDisconnected).not.toHaveBeenCalled();
    });

    it("keeps the reconnect grace window for a network drop", async () => {
        await leaveEvent(2);

        expect(callLifecycle.markDisconnected).toHaveBeenCalledWith(REQ, USER, "agora_left");
        expect(callLifecycle.endCallForAll).not.toHaveBeenCalled();
    });

    it("treats a leave without a reason as a drop", async () => {
        await leaveEvent(undefined);

        expect(callLifecycle.markDisconnected).toHaveBeenCalled();
        expect(callLifecycle.endCallForAll).not.toHaveBeenCalled();
    });
});
