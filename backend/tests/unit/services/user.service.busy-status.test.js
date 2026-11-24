const mockUser = { findByPk: jest.fn() };

jest.mock("../../../src/models", () => ({
    User: mockUser,
    Chat: { count: jest.fn() },
    ChatSetting: {},
    UserBlockList: {},
    UserFavorite: {},
    Wallet: {},
    WalletTransaction: {},
    Transaction: {},
}));
jest.mock("../../../src/services/s3.service", () => ({}));
jest.mock("../../../src/services/pricing.service", () => ({}));
jest.mock("../../../src/services/redis.service", () => ({
    getUserBusyStatus: jest.fn(),
}));
const mockIo = { emit: jest.fn() };
jest.mock("../../../src/config/websocket", () => ({ getIO: () => mockIo }));

const { Chat } = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");
const userService = require("../../../src/services/user.service");

const makeUser = (overrides = {}) => ({
    id: "listener-1",
    manualOffline: false,
    isBusy: false,
    isManualBusy: false,
    save: jest.fn().mockResolvedValue(),
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    redisService.getUserBusyStatus.mockResolvedValue(null);
    Chat.count.mockResolvedValue(0);
});

describe("updateBusyStatus (manual do-not-disturb)", () => {
    it("turning it on sets the manual flag and leaves the session hash alone", async () => {
        const user = makeUser();
        mockUser.findByPk.mockResolvedValue(user);

        await userService.updateBusyStatus("listener-1", true);

        expect(user.isManualBusy).toBe(true);
        expect(user.isBusy).toBe(true);
        expect(user.save).toHaveBeenCalled();
        expect(mockIo.emit).toHaveBeenCalledWith("listener:status-changed", expect.objectContaining({
            listenerId: "listener-1", isBusy: true, busyType: "manual",
        }));
    });

    it("turning it off clears only the manual flag when nothing else is going on", async () => {
        const user = makeUser({ isManualBusy: true, isBusy: true });
        mockUser.findByPk.mockResolvedValue(user);

        await userService.updateBusyStatus("listener-1", false);

        expect(user.isManualBusy).toBe(false);
        expect(user.isBusy).toBe(false);
        expect(mockIo.emit).toHaveBeenCalledWith("listener:status-changed", expect.objectContaining({
            isBusy: false, busyType: undefined,
        }));
    });

    it("turning it off mid-session keeps the listener busy for the live session", async () => {
        const user = makeUser({ isManualBusy: true, isBusy: true });
        mockUser.findByPk.mockResolvedValue(user);
        redisService.getUserBusyStatus.mockResolvedValue({ conversationId: "chat-1", type: "video_call" });

        await userService.updateBusyStatus("listener-1", false);

        expect(user.isManualBusy).toBe(false);
        expect(user.isBusy).toBe(true);
        expect(mockIo.emit).toHaveBeenCalledWith("listener:status-changed", expect.objectContaining({
            isBusy: true, busyType: "video_call",
        }));
    });

    it("a started chat also keeps the listener busy when manual busy is turned off", async () => {
        const user = makeUser({ isManualBusy: true, isBusy: true });
        mockUser.findByPk.mockResolvedValue(user);
        Chat.count.mockResolvedValue(1);

        await userService.updateBusyStatus("listener-1", false);

        expect(user.isBusy).toBe(true);
    });

    it('treats the string "false" as false (it is truthy in JS) and rejects other non-booleans', async () => {
        const user = makeUser({ isManualBusy: true, isBusy: true });
        mockUser.findByPk.mockResolvedValue(user);

        await userService.updateBusyStatus("listener-1", "false");
        expect(user.isManualBusy).toBe(false);

        await expect(userService.updateBusyStatus("listener-1", "maybe")).rejects.toThrow("isBusy must be a boolean");
        await expect(userService.updateBusyStatus("listener-1", 1)).rejects.toThrow("isBusy must be a boolean");
    });
});
