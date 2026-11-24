// Mock collaborators BEFORE requiring the service under test.
jest.mock("../../../src/services/callDurationMonitor.service", () => ({
  startMonitoring: jest.fn().mockResolvedValue(),
  stopMonitoring: jest.fn().mockResolvedValue(0),
  pauseMonitoring: jest.fn().mockResolvedValue(),
  resumeMonitoring: jest.fn().mockResolvedValue(),
  recordActivity: jest.fn().mockResolvedValue(),
}));

jest.mock("../../../src/services/conversation.service", () => ({
  startConversation: jest
    .fn()
    .mockResolvedValue({
      conversation: {},
      balanceInfo: { affordableSeconds: 120 },
    }),
  endConversation: jest.fn().mockResolvedValue({ billing: null }),
}));

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
jest.mock("../../../src/config/websocket", () => ({
  getIO: jest.fn(() => ({ to: mockTo })),
}));

const callLifecycle = require("../../../src/services/callLifecycle.service");
const callDurationMonitor = require("../../../src/services/callDurationMonitor.service");
const conversationService = require("../../../src/services/conversation.service");
const redisService = require("../../../src/services/redis.service"); // globally mocked in tests/setup.js

const REQUEST_ID = "req-1";
const CONV_ID = "conv-1";
const SENDER = "user-sender";
const RECEIVER = "user-receiver";

const baseCallData = (overrides = {}) => ({
  conversationId: CONV_ID,
  senderId: SENDER,
  receiverId: RECEIVER,
  serviceType: "audio",
  balanceInfo: JSON.stringify({ affordableSeconds: 120 }),
  status: "accepted",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: not a reconnect
  redisService.client.exists.mockResolvedValue(0);
  redisService.client.get.mockResolvedValue(null);
  redisService.client.hGet.mockResolvedValue(null);
  redisService.client.hGetAll.mockResolvedValue(baseCallData());
});

describe("callLifecycle.markConnected", () => {
  it("does NOT start billing until both participants are connected", async () => {
    redisService.client.sMembers.mockResolvedValue([SENDER]); // only one in

    const result = await callLifecycle.markConnected(REQUEST_ID, SENDER);

    expect(result.started).toBe(false);
    expect(conversationService.startConversation).not.toHaveBeenCalled();
    expect(callDurationMonitor.startMonitoring).not.toHaveBeenCalled();
  });

  it("starts billing once both participants are connected", async () => {
    redisService.client.sMembers.mockResolvedValue([SENDER, RECEIVER]);

    const result = await callLifecycle.markConnected(REQUEST_ID, RECEIVER);

    expect(result.started).toBe(true);
    // The production startConversation call has passed io as its fifth argument since before the audit changes.
    expect(conversationService.startConversation).toHaveBeenCalledWith(
      CONV_ID,
      true,
      SENDER,
      "audio",
      expect.any(Object),
    );
    expect(callDurationMonitor.startMonitoring).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      "call-billing-started",
      expect.objectContaining({ request_id: REQUEST_ID }),
    );
  });

  it("is idempotent — a duplicate signal after start does not bill again", async () => {
    redisService.client.sMembers.mockResolvedValue([SENDER, RECEIVER]);
    redisService.client.hGetAll.mockResolvedValue(
      baseCallData({ status: "started" }),
    );

    const result = await callLifecycle.markConnected(REQUEST_ID, RECEIVER);

    expect(result.started).toBe(true);
    expect(conversationService.startConversation).not.toHaveBeenCalled();
    expect(callDurationMonitor.startMonitoring).not.toHaveBeenCalled();
  });

  it("serializes concurrent both-connected signals", async () => {
    redisService.client.sMembers.mockResolvedValue([SENDER, RECEIVER]);
    redisService.client.hGetAll.mockResolvedValue(baseCallData());
    redisService.client.set
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce(null);

    await Promise.all([
      callLifecycle.markConnected(REQUEST_ID, SENDER),
      callLifecycle.markConnected(REQUEST_ID, RECEIVER),
    ]);

    expect(conversationService.startConversation).toHaveBeenCalledTimes(1);
    expect(callDurationMonitor.startMonitoring).toHaveBeenCalledTimes(1);
  });

  it("resumes a paused call on reconnect instead of starting fresh", async () => {
    redisService.client.get.mockResolvedValue(`${SENDER}|marker`); // SENDER dropped, window active
    redisService.client.hGetAll.mockResolvedValue(
      baseCallData({ status: "started" }),
    );

    const result = await callLifecycle.markConnected(REQUEST_ID, SENDER);

    expect(result.reconnected).toBe(true);
    expect(callDurationMonitor.resumeMonitoring).toHaveBeenCalledTimes(1);
    expect(conversationService.startConversation).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(
      "call-participant-reconnected",
      expect.objectContaining({ request_id: REQUEST_ID }),
    );
  });
});

describe("callLifecycle reconnect grace window", () => {
  afterEach(() => {
    jest.useRealTimers();
    // Tests below may swap the io stub; restore the shared one.
    require("../../../src/config/websocket").getIO.mockImplementation(() => ({
      to: () => ({ emit: mockEmit }),
    }));
  });

  it("does not resume billing when the OTHER participant joins during someone's grace window", async () => {
    redisService.client.get.mockResolvedValue(`${SENDER}|marker`);
    redisService.client.sMembers.mockResolvedValue([SENDER, RECEIVER]);
    redisService.client.hGetAll.mockResolvedValue(baseCallData({ status: "started" }));

    const result = await callLifecycle.markConnected(REQUEST_ID, RECEIVER);

    expect(result.reconnected).toBe(false);
    expect(callDurationMonitor.resumeMonitoring).not.toHaveBeenCalled();
    expect(redisService.client.del).not.toHaveBeenCalledWith(`call:${REQUEST_ID}:reconnect`);
  });

  it("un-pauses a paused monitor when a participant reconnects after the marker is gone", async () => {
    redisService.client.hGetAll.mockResolvedValue(baseCallData({ status: "started" }));
    redisService.client.sMembers.mockResolvedValue([SENDER, RECEIVER]);
    redisService.client.hGet.mockResolvedValue("paused");

    await callLifecycle.markConnected(REQUEST_ID, SENDER);

    expect(callDurationMonitor.resumeMonitoring).toHaveBeenCalledTimes(1);
  });

  it("ends the call when the grace window expires without a reconnect", async () => {
    jest.useFakeTimers();
    let storedMarker = null;
    redisService.client.set.mockImplementation(async (key, value) => {
      if (key === `call:${REQUEST_ID}:reconnect`) storedMarker = value;
      return "OK";
    });
    redisService.client.get.mockImplementation(async () => storedMarker);
    redisService.client.hGetAll.mockResolvedValue(baseCallData({ status: "started" }));

    await callLifecycle.markDisconnected(REQUEST_ID, SENDER, "socket_disconnect");
    expect(callDurationMonitor.pauseMonitoring).toHaveBeenCalledWith(REQUEST_ID);

    await jest.advanceTimersByTimeAsync(callLifecycle.RECONNECT_GRACE_SECONDS * 1000 + 100);

    expect(conversationService.endConversation).toHaveBeenCalledTimes(1);
    expect(conversationService.endConversation).toHaveBeenCalledWith(
      CONV_ID,
      expect.objectContaining({ source: "callLifecycle.endCall:reconnect_timeout" }),
    );
  });

  it("does not end the call when the participant reconnected inside the window", async () => {
    jest.useFakeTimers();
    let storedMarker = null;
    redisService.client.set.mockImplementation(async (key, value) => {
      if (key === `call:${REQUEST_ID}:reconnect`) storedMarker = value;
      return "OK";
    });
    redisService.client.get.mockImplementation(async () => storedMarker);
    redisService.client.del.mockImplementation(async (key) => {
      if (key === `call:${REQUEST_ID}:reconnect`) storedMarker = null;
      return 1;
    });
    redisService.client.hGetAll.mockResolvedValue(baseCallData({ status: "started" }));

    await callLifecycle.markDisconnected(REQUEST_ID, SENDER, "socket_disconnect");
    await callLifecycle.markConnected(REQUEST_ID, SENDER);
    await jest.advanceTimersByTimeAsync(callLifecycle.RECONNECT_GRACE_SECONDS * 1000 + 100);

    expect(conversationService.endConversation).not.toHaveBeenCalled();
  });

  it("sends the zero-balance recharge prompt to the payer, not the listener who called", async () => {
    redisService.client.sMembers.mockResolvedValue([SENDER, RECEIVER]);
    conversationService.startConversation.mockResolvedValueOnce({
      conversation: {},
      balanceInfo: { affordableSeconds: 0, balance: 0, freeSecondsRemaining: 0 },
    });
    // SENDER is the listener, RECEIVER the paying user
    redisService.client.hGetAll.mockResolvedValue(
      baseCallData({ payerId: RECEIVER, earnerId: SENDER, serviceType: "video_call" }),
    );
    const rooms = [];
    require("../../../src/config/websocket").getIO.mockReturnValue({
      to: (room) => ({ emit: (event) => rooms.push([room, event]) }),
    });

    await callLifecycle.markConnected(REQUEST_ID, SENDER);

    expect(rooms).toContainEqual([`user:${RECEIVER}`, "wallet:recharge_required"]);
    expect(rooms).not.toContainEqual([`user:${SENDER}`, "wallet:recharge_required"]);
  });

  it("passes the real payer and earner to the duration monitor", async () => {
    redisService.client.sMembers.mockResolvedValue([SENDER, RECEIVER]);
    redisService.client.hGetAll.mockResolvedValue(
      baseCallData({ payerId: RECEIVER, earnerId: SENDER, serviceType: "video_call" }),
    );

    await callLifecycle.markConnected(REQUEST_ID, SENDER);

    expect(callDurationMonitor.startMonitoring).toHaveBeenCalledWith(
      REQUEST_ID, CONV_ID, SENDER, RECEIVER, 120, expect.anything(), "video_call", RECEIVER, SENDER,
    );
  });
});

describe("callLifecycle.endCall", () => {
  it("stops the monitor, ends the conversation, and cleans up Redis keys", async () => {
    await callLifecycle.endCall(
      REQUEST_ID,
      baseCallData({ status: "started" }),
      "user_ended",
      SENDER,
    );

    expect(callDurationMonitor.stopMonitoring).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.objectContaining({
        reason: "endCall:user_ended",
        conversationId: CONV_ID,
        callStatus: "started",
      }),
    );
    expect(conversationService.endConversation).toHaveBeenCalledWith(CONV_ID, {
      payerId: SENDER,
      pausedSeconds: 0,
      io: expect.any(Object),
      reason: "manual",
      triggeredByUserId: SENDER,
      source: "callLifecycle.endCall:user_ended",
    });
    // Cleans up the five call-related keys
    expect(redisService.client.del).toHaveBeenCalledWith(`call:${REQUEST_ID}`);
    expect(redisService.client.del).toHaveBeenCalledWith(`call:${CONV_ID}`);
    expect(redisService.client.del).toHaveBeenCalledWith(
      `call:${REQUEST_ID}:connected`,
    );
    expect(redisService.client.del).toHaveBeenCalledWith(
      `call:${REQUEST_ID}:reconnect`,
    );
  });

  it("emits wallet balance updates when billing is processed", async () => {
    conversationService.endConversation.mockResolvedValue({
      billing: {
        payerTransaction: { amount: -10, balanceAfter: 90 },
        earnerTransaction: { amount: 8, balanceAfter: 108 },
      },
    });

    await callLifecycle.endCall(
      REQUEST_ID,
      baseCallData({ status: "started" }),
      "user_ended",
    );

    expect(mockEmit).toHaveBeenCalledWith(
      "wallet:balance_updated",
      expect.objectContaining({ type: "debit" }),
    );
    expect(mockEmit).toHaveBeenCalledWith(
      "wallet:balance_updated",
      expect.objectContaining({ type: "credit" }),
    );
  });

  it("is a no-op when the call is already cleaned up", async () => {
    redisService.client.hGetAll.mockResolvedValue({}); // nothing stored

    await callLifecycle.endCall(REQUEST_ID, null, "agora_channel_destroyed");

    expect(conversationService.endConversation).not.toHaveBeenCalled();
    expect(redisService.client.del).not.toHaveBeenCalled();
  });
});

describe("callLifecycle.endCallForAll", () => {
  beforeEach(() => {
    // Earlier tests swap getIO's return value; point it back at the recording mock.
    require("../../../src/config/websocket").getIO.mockImplementation(() => ({ to: mockTo }));
  });

  it("ends the call and tells both participants to leave the room", async () => {
    redisService.client.hGetAll.mockResolvedValue(baseCallData({ status: "started" }));

    await callLifecycle.endCallForAll(REQUEST_ID, SENDER, "peer_left");

    expect(conversationService.endConversation).toHaveBeenCalledWith(
      CONV_ID,
      expect.objectContaining({ reason: "manual", triggeredByUserId: SENDER }),
    );
    expect(mockTo).toHaveBeenCalledWith([`user:${SENDER}`, `user:${RECEIVER}`]);
    expect(mockEmit).toHaveBeenCalledWith("call-ended", {
      request_id: REQUEST_ID,
      sender_id: SENDER,
      reason: "peer_left",
      auto_leave: true,
    });
  });

  it("does nothing when the call is already cleaned up", async () => {
    redisService.client.hGetAll.mockResolvedValue({});

    await callLifecycle.endCallForAll(REQUEST_ID, SENDER, "peer_left");

    expect(conversationService.endConversation).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalledWith("call-ended", expect.anything());
  });
});

describe("callLifecycle restart recovery", () => {
  const markerKey = `call:${REQUEST_ID}:reconnect`;

  afterEach(() => {
    jest.useRealTimers();
    redisService.client.scanIterator.mockImplementation(async function* () {});
  });

  const withMarker = (marker) => {
    redisService.client.scanIterator.mockImplementation(async function* () { yield [markerKey]; });
    redisService.client.get.mockImplementation(async (key) => (key === markerKey ? marker : null));
    redisService.client.hGetAll.mockResolvedValue(baseCallData({ status: "started" }));
  };

  it("re-arms a lost grace timer for only the time left in the window", async () => {
    jest.useFakeTimers();
    // Dropped 10s before the restart: 20s of the 30s window remain.
    withMarker(`${SENDER}|${Date.now() - 10_000}:0.5`);

    expect(await callLifecycle.recoverReconnectTimers()).toBe(1);

    await jest.advanceTimersByTimeAsync(19_000);
    expect(conversationService.endConversation).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_500);
    expect(conversationService.endConversation).toHaveBeenCalledWith(
      CONV_ID,
      expect.objectContaining({ source: "callLifecycle.endCall:reconnect_timeout" }),
    );
    expect(mockEmit).toHaveBeenCalledWith(
      "call-ended",
      expect.objectContaining({ request_id: REQUEST_ID, sender_id: SENDER, reason: "reconnect_timeout" }),
    );
  });

  it("does not end the call if the participant reconnected before the re-armed timer fires", async () => {
    jest.useFakeTimers();
    const marker = `${SENDER}|${Date.now()}:0.5`;
    withMarker(marker);

    await callLifecycle.recoverReconnectTimers();
    // Reconnect clears the marker.
    redisService.client.get.mockResolvedValue(null);
    await jest.advanceTimersByTimeAsync(callLifecycle.RECONNECT_GRACE_SECONDS * 1000 + 100);

    expect(conversationService.endConversation).not.toHaveBeenCalled();
  });

  it("endExpiredGrace ends a still-started call with reconnect_timeout", async () => {
    redisService.client.hGetAll.mockResolvedValue(baseCallData({ status: "started" }));

    await callLifecycle.endExpiredGrace(REQUEST_ID);

    expect(callDurationMonitor.stopMonitoring).toHaveBeenCalledWith(REQUEST_ID, expect.any(Object));
    expect(conversationService.endConversation).toHaveBeenCalledWith(
      CONV_ID,
      expect.objectContaining({ source: "callLifecycle.endCall:reconnect_timeout" }),
    );
  });

  it("endExpiredGrace leaves a call that is no longer started alone", async () => {
    redisService.client.hGetAll.mockResolvedValue({});

    await callLifecycle.endExpiredGrace(REQUEST_ID);

    expect(conversationService.endConversation).not.toHaveBeenCalled();
  });
});
