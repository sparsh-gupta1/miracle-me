const mockCallRequest = {
    update: jest.fn(),
    findByPk: jest.fn(),
};

jest.mock("../../../src/models", () => ({ User: {}, CallRequest: mockCallRequest }));
jest.mock("../../../src/services/chat.service.js", () => ({
    getOrCreateChat: jest.fn().mockResolvedValue({ id: "chat-1" }),
}));
jest.mock("../../../src/services/conversation.service.js", () => ({}));
jest.mock("../../../src/services/redis.service.js", () => ({
    removeUserFromActiveChat: jest.fn().mockResolvedValue(),
}));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { Op } = require("sequelize");
const service = require("../../../src/services/chatRequest.service.js");

const CALLER = "caller-1";
const RECEIVER = "receiver-1";
const requestRow = (status) => ({
    id: "req-1",
    senderId: CALLER,
    receiverId: RECEIVER,
    status,
    calculateDuractionToAccept: jest.fn().mockResolvedValue(3),
});

beforeEach(() => jest.clearAllMocks());

describe("acceptCallRequest", () => {
    it("claims a pending request with one conditional update scoped to the receiver", async () => {
        mockCallRequest.update.mockResolvedValue([1]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("accepted"));

        const res = await service.acceptCallRequest("req-1", RECEIVER);

        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "accepted" }),
            { where: { id: "req-1", status: "pending", receiverId: RECEIVER } }
        );
        expect(res).toEqual({ success: true, senderId: CALLER });
    });

    it("loses cleanly when another accept, a cancel or the timeout got there first", async () => {
        mockCallRequest.update.mockResolvedValue([0]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("missed"));

        const res = await service.acceptCallRequest("req-1", RECEIVER);

        expect(res).toEqual({ success: false, alreadyHandled: true, message: "Call request is already missed" });
    });

    it("refuses someone other than the receiver", async () => {
        mockCallRequest.update.mockResolvedValue([0]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("pending"));

        const res = await service.acceptCallRequest("req-1", "intruder");

        expect(res.success).toBe(false);
        expect(res.message).toMatch(/Only the receiving user/);
    });
});

describe("rejectCallRequest", () => {
    it("never overwrites a request that already left pending", async () => {
        mockCallRequest.update.mockResolvedValue([0]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("cancelled"));

        const res = await service.rejectCallRequest("req-1", RECEIVER);

        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "rejected", rejectionTimestamp: expect.any(Date) }),
            { where: { id: "req-1", status: "pending", receiverId: RECEIVER } }
        );
        expect(res.success).toBe(false);
        expect(res.alreadyHandled).toBe(true);
    });

    it("returns both participants so callers can free them", async () => {
        mockCallRequest.update.mockResolvedValue([1]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("rejected"));

        const res = await service.rejectCallRequest("req-1", RECEIVER);

        expect(res).toEqual({ success: true, senderId: CALLER, receiverId: RECEIVER });
    });
});

describe("cancelCallRequest", () => {
    it("is limited to the caller and, by default, to pending requests", async () => {
        mockCallRequest.update.mockResolvedValue([1]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("cancelled"));

        const res = await service.cancelCallRequest("req-1", { senderId: CALLER });

        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "cancelled" }),
            { where: { id: "req-1", status: { [Op.in]: ["pending"] }, senderId: CALLER } }
        );
        expect(res.success).toBe(true);
    });

    it("refuses the receiver trying to cancel", async () => {
        mockCallRequest.update.mockResolvedValue([0]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("pending"));

        const res = await service.cancelCallRequest("req-1", { senderId: RECEIVER });

        expect(res).toEqual({ success: false, message: "Only the caller can cancel this call" });
    });

    it("can cancel an accepted-but-not-joined call when the caller socket drops", async () => {
        mockCallRequest.update.mockResolvedValue([1]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("cancelled"));

        await service.cancelCallRequest("req-1", { statuses: ["pending", "accepted"] });

        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.anything(),
            { where: { id: "req-1", status: { [Op.in]: ["pending", "accepted"] } } }
        );
    });
});

describe("missedCallRequest", () => {
    it("does not mark an already-accepted request as missed", async () => {
        mockCallRequest.update.mockResolvedValue([0]);
        mockCallRequest.findByPk.mockResolvedValue(requestRow("accepted"));

        const res = await service.missedCallRequest("req-1");

        expect(mockCallRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: "missed" }),
            { where: { id: "req-1", status: "pending" } }
        );
        expect(res.alreadyHandled).toBe(true);
    });
});
