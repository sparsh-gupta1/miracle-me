const mockRedisClient = {
    hSet: jest.fn().mockResolvedValue(),
    hGetAll: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(),
    set: jest.fn().mockResolvedValue("OK"),
    scan: jest.fn(),
};

jest.mock("../../../src/services/redis.service", () => ({ client: mockRedisClient }));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock("../../../src/services/conversation.service", () => ({
    endConversation: jest.fn(),
    resolvePayerEarner: jest.fn(),
}));
jest.mock("../../../src/services/callLifecycle.service", () => ({ endExpiredGrace: jest.fn() }));
const mockChatFindAll = jest.fn();
jest.mock("../../../src/models", () => ({
    Chat: { findAll: (...args) => mockChatFindAll(...args) },
    User: {},
}));

const monitor = require("../../../src/services/callDurationMonitor.service");
const callLifecycle = require("../../../src/services/callLifecycle.service");

const CALL = "req-1";
const pausedAt = new Date(Date.now() - 12_000).toISOString();
const monitorState = (overrides = {}) => ({
    conversationId: "conv-1",
    senderId: "user-1",
    receiverId: "listener-1",
    startTime: new Date(Date.now() - 60_000).toISOString(),
    affordableSeconds: "600",
    status: "monitoring",
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    monitor.suspendAll();
    monitor.activeMonitors.clear();
    mockChatFindAll.mockResolvedValue([{ id: "conv-1", participant1: {}, participant2: {} }]);
    mockRedisClient.scan.mockResolvedValue({ cursor: "0", keys: [`call-monitor:${CALL}`] });
});

afterAll(() => {
    monitor.suspendAll();
    monitor.activeMonitors.clear();
});

describe("callDurationMonitor restart recovery", () => {
    it("restarts the interval for a call that was running", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(monitorState());

        await monitor.recoverActiveSessions({});

        const entry = monitor.activeMonitors.get(CALL);
        expect(entry.intervalId).toBeTruthy();
        expect(entry.pausedAt).toBeNull();
    });

    it("keeps a paused call paused, with its original pause start, while its grace marker is live", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(monitorState({ status: "paused", pausedAt }));
        mockRedisClient.get.mockResolvedValue("user-1|123:0.5");

        await monitor.recoverActiveSessions({});

        const entry = monitor.activeMonitors.get(CALL);
        expect(entry.intervalId).toBeNull();
        expect(entry.pausedAt).toBe(Date.parse(pausedAt));
        expect(callLifecycle.endExpiredGrace).not.toHaveBeenCalled();
    });

    it("ends a paused call whose grace window ran out while the server was down", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(monitorState({ status: "paused", pausedAt }));
        mockRedisClient.get.mockResolvedValue(null);

        await monitor.recoverActiveSessions({});

        expect(callLifecycle.endExpiredGrace).toHaveBeenCalledWith(CALL);
    });

    it("suspendAll stops timers without marking calls ended", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(monitorState());
        await monitor.recoverActiveSessions({});
        mockRedisClient.hSet.mockClear();

        monitor.suspendAll();

        expect(monitor.activeMonitors.get(CALL).intervalId).toBeNull();
        expect(mockRedisClient.hSet).not.toHaveBeenCalled();
    });
});
