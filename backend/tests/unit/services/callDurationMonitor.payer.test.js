const mockRedisClient = {
    hSet: jest.fn().mockResolvedValue(),
    hGet: jest.fn().mockResolvedValue(null),
    hGetAll: jest.fn().mockResolvedValue({}),
    exists: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(),
    del: jest.fn().mockResolvedValue(),
    set: jest.fn().mockResolvedValue("OK"),
    incr: jest.fn().mockResolvedValue(1),
    scan: jest.fn(),
};

jest.mock("../../../src/services/redis.service", () => ({ client: mockRedisClient }));
jest.mock("../../../src/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock("../../../src/services/conversation.service", () => ({
    validateBalanceAndCalculateDuration: jest.fn(),
    endConversation: jest.fn(),
    resolvePayerEarner: jest.fn(),
}));
const mockChatFindAll = jest.fn();
jest.mock("../../../src/models", () => ({
    Chat: { findAll: (...args) => mockChatFindAll(...args) },
    User: {},
}));

const conversationService = require("../../../src/services/conversation.service");
const monitor = require("../../../src/services/callDurationMonitor.service");

// A listener (LISTENER) calls a paying user (USER): the user is the payer even though the
// listener is the sender.
const LISTENER = "listener-1";
const USER = "user-1";
const monitorState = (overrides = {}) => ({
    conversationId: "conv-1",
    senderId: LISTENER,
    receiverId: USER,
    payerId: USER,
    earnerId: LISTENER,
    serviceType: "video_call",
    startTime: new Date(Date.now() - 10_000).toISOString(),
    affordableSeconds: "600",
    totalPausedSeconds: "0",
    warningsSent: "[]",
    lastBalanceCheckAt: new Date(0).toISOString(),
    status: "monitoring",
    ...overrides,
});

function makeIo() {
    const emits = [];
    return { emits, to: (room) => ({ emit: (event, payload) => emits.push([room, event, payload]) }) };
}

afterEach(() => {
    for (const [, m] of monitor.activeMonitors) clearInterval(m.intervalId);
    monitor.activeMonitors.clear();
});

describe("callDurationMonitor with a listener-started call", () => {
    beforeEach(() => jest.clearAllMocks());

    it("stores payerId and earnerId when monitoring starts", async () => {
        await monitor.startMonitoring("req-1", "conv-1", LISTENER, USER, 600, makeIo(), "video_call", USER, LISTENER);

        expect(mockRedisClient.hSet).toHaveBeenCalledWith(
            "call-monitor:req-1",
            expect.objectContaining({ senderId: LISTENER, receiverId: USER, payerId: USER, earnerId: LISTENER })
        );
    });

    it("defaults to caller-pays when no payer is given", async () => {
        await monitor.startMonitoring("req-2", "conv-1", USER, LISTENER, 600, makeIo(), "audio_call");

        expect(mockRedisClient.hSet).toHaveBeenCalledWith(
            "call-monitor:req-2",
            expect.objectContaining({ payerId: USER, earnerId: LISTENER })
        );
    });

    it("re-checks the PAYER's balance, not the caller's, and keeps the call alive", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(monitorState());
        conversationService.validateBalanceAndCalculateDuration.mockResolvedValue({ affordableSeconds: 600 });
        const io = makeIo();

        await monitor._checkDuration("req-1", io);

        expect(conversationService.validateBalanceAndCalculateDuration).toHaveBeenCalledWith(USER, LISTENER, "video_call");
        expect(conversationService.endConversation).not.toHaveBeenCalled();
    });

    it("sends the 90% warning to the payer, not the listener who placed the call", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(
            monitorState({ startTime: new Date(Date.now() - 95_000).toISOString(), affordableSeconds: "100" })
        );
        conversationService.validateBalanceAndCalculateDuration.mockResolvedValue({ affordableSeconds: 100 });
        const io = makeIo();

        await monitor._checkDuration("req-1", io);

        const warnings = io.emits.filter(([, event]) => event === "call-duration-warning");
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.every(([room]) => room === `user:${USER}`)).toBe(true);
    });

    it("bills and notifies the real payer/earner when the balance runs out", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(
            monitorState({ startTime: new Date(Date.now() - 120_000).toISOString(), affordableSeconds: "100" })
        );
        conversationService.validateBalanceAndCalculateDuration.mockResolvedValue({ affordableSeconds: 100 });
        conversationService.endConversation.mockResolvedValue({
            conversation: { id: "conv-1", durationSeconds: 100, serviceType: "video_call" },
            billing: {
                payerTransaction: { amount: -50, balanceAfter: 0 },
                earnerTransaction: { amount: 40, balanceAfter: 140 },
            },
        });
        const io = makeIo();

        await monitor._checkDuration("req-1", io);

        expect(conversationService.endConversation).toHaveBeenCalledWith(
            "conv-1",
            expect.objectContaining({ payerId: USER })
        );
        const byEvent = (name) => io.emits.filter(([, event]) => event === name).map(([room]) => room);
        const debit = io.emits.find(([, event, p]) => event === "wallet:balance_updated" && p.type === "debit");
        const credit = io.emits.find(([, event, p]) => event === "wallet:balance_updated" && p.type === "credit");
        expect(debit[0]).toBe(`user:${USER}`);
        expect(credit[0]).toBe(`user:${LISTENER}`);
        expect(byEvent("wallet:recharge_required")).toEqual([`user:${USER}`]);
    });

    it("prompts the payer to recharge when a fully free call runs out (no debit)", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(
            monitorState({ startTime: new Date(Date.now() - 120_000).toISOString(), affordableSeconds: "60" })
        );
        conversationService.validateBalanceAndCalculateDuration.mockResolvedValue({ affordableSeconds: 60 });
        conversationService.endConversation.mockResolvedValue({
            conversation: { id: "conv-1", durationSeconds: 60, serviceType: "video_call" },
            billing: null,
        });
        const io = makeIo();

        await monitor._checkDuration("req-1", io);

        const prompts = io.emits.filter(([, event]) => event === "wallet:recharge_required");
        expect(prompts).toHaveLength(1);
        expect(prompts[0][0]).toBe(`user:${USER}`);
        expect(prompts[0][2]).toEqual(expect.objectContaining({ balanceAfter: 0, freeSecondsRemaining: 0 }));
        const ended = io.emits.filter(([, event]) => event === "call-ended");
        expect(ended.map(([room]) => room).sort()).toEqual([`user:${LISTENER}`, `user:${USER}`].sort());
        expect(ended.every(([, , p]) => p.auto_leave === true)).toBe(true);
    });

    it("falls back to sender/receiver for monitor state written before payerId existed", async () => {
        mockRedisClient.hGetAll.mockResolvedValue(monitorState({ payerId: undefined, earnerId: undefined }));
        conversationService.validateBalanceAndCalculateDuration.mockResolvedValue({ affordableSeconds: 600 });

        await monitor._checkDuration("req-1", makeIo());

        expect(conversationService.validateBalanceAndCalculateDuration).toHaveBeenCalledWith(LISTENER, USER, "video_call");
    });
});

describe("callDurationMonitor.stopMonitoring paused time", () => {
    beforeEach(() => jest.clearAllMocks());

    it("excludes an in-progress pause from the billed duration", async () => {
        await monitor.startMonitoring("req-9", "conv-1", USER, LISTENER, 600, makeIo(), "audio_call");
        mockRedisClient.hGetAll.mockResolvedValue({ conversationId: "conv-1", totalPausedSeconds: "4" });
        await monitor.pauseMonitoring("req-9");
        monitor.activeMonitors.get("req-9").pausedAt = Date.now() - 12_000;

        const paused = await monitor.stopMonitoring("req-9");

        expect(paused).toBe(16); // 4 already banked + 12 still open
    });

    it("keeps the original pause start when a duplicate disconnect pauses again", async () => {
        await monitor.startMonitoring("req-10", "conv-1", USER, LISTENER, 600, makeIo(), "audio_call");
        await monitor.pauseMonitoring("req-10");
        const firstPausedAt = monitor.activeMonitors.get("req-10").pausedAt = Date.now() - 20_000;

        await monitor.pauseMonitoring("req-10");

        expect(monitor.activeMonitors.get("req-10").pausedAt).toBe(firstPausedAt);
    });
});

describe("callDurationMonitor.recoverActiveSessions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockChatFindAll.mockResolvedValue([
            { id: "conv-1", participant1: { id: LISTENER, role: "listener" }, participant2: { id: USER, role: "user" } },
        ]);
        conversationService.resolvePayerEarner.mockReturnValue({ payerId: USER, earnerId: LISTENER });
        conversationService.endConversation.mockResolvedValue({});
    });

    it("terminates when node-redis returns the SCAN cursor as the string '0'", async () => {
        // The old `cursor !== 0` check never matched a string cursor and looped forever.
        mockRedisClient.scan.mockResolvedValue({ cursor: "0", keys: [] });

        await monitor.recoverActiveSessions(makeIo());

        expect(mockRedisClient.scan).toHaveBeenCalledTimes(1);
        expect(conversationService.endConversation).toHaveBeenCalledWith(
            "conv-1",
            expect.objectContaining({ payerId: USER, source: "boot_reconciliation" })
        );
    });

    it("follows a multi-page SCAN until the cursor returns to '0'", async () => {
        mockRedisClient.scan
            .mockResolvedValueOnce({ cursor: "17", keys: [] })
            .mockResolvedValueOnce({ cursor: "0", keys: [] });

        await monitor.recoverActiveSessions(makeIo());

        expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
        expect(mockRedisClient.scan.mock.calls[1][0]).toBe("17");
    });

    it("restores payer/earner on a recovered monitor", async () => {
        mockRedisClient.scan.mockResolvedValue({ cursor: "0", keys: ["call-monitor:req-7"] });
        mockRedisClient.hGetAll.mockResolvedValue(monitorState());

        await monitor.recoverActiveSessions(makeIo());

        const recovered = monitor.activeMonitors.get("req-7");
        expect(recovered).toEqual(expect.objectContaining({ payerId: USER, earnerId: LISTENER }));
    });

    it("releases the recovery lock afterwards so a quick restart can recover again", async () => {
        mockRedisClient.scan.mockResolvedValue({ cursor: "0", keys: [] });

        await monitor.recoverActiveSessions(makeIo());

        expect(mockRedisClient.del).toHaveBeenCalledWith("recover-lock");
    });

    it("does not release a lock it never acquired", async () => {
        mockRedisClient.set.mockResolvedValueOnce(null);

        await monitor.recoverActiveSessions(makeIo());

        expect(mockRedisClient.del).not.toHaveBeenCalledWith("recover-lock");
    });
});
