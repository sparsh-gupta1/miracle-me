jest.mock("../../src/config/websocket", () => ({
  getIO: jest.fn(() => mockIO),
}));
jest.mock("../../src/services/penalty.service", () => ({}));

const mockIO = {
  emit: jest.fn(),
  to: jest.fn(() => ({ emit: jest.fn() })),
  in: jest.fn(() => ({
    fetchSockets: jest.fn().mockResolvedValue([]),
    socketsLeave: jest.fn(),
  })),
};

const { Chat, User, sequelize } = require("../../src/models");
const redisService = require("../../src/services/redis.service");
const billingService = require("../../src/services/billing.service");
const walletService = require("../../src/services/wallet.service");
const freeMinutesService = require("../../src/services/freeMinutes.service");
const conversationService = require("../../src/services/conversation.service");
const chatSessionService = require("../../src/services/chatSession.service");
const callDurationMonitor = require("../../src/services/callDurationMonitor.service");
const callLifecycle = require("../../src/services/callLifecycle.service");
const conversationHandler = require("../../src/websocket/handlers/conversation.handler");
const chatHandler = require("../../src/websocket/handlers/chat.handler");

const activityKeys = new Map();
let userSequence = 0;
let createdUserIds = [];
let createdChatIds = [];

async function createUser(role) {
  userSequence += 1;
  const suffix = String(userSequence).padStart(4, "0");
  const user = await User.create({
    name: `Audit ${role} ${suffix}`,
    email: `audit-${role}-${suffix}@example.com`,
    mobileNumber: `55555${suffix}01`,
    password: "password123",
    role,
    isVerified: true,
  });
  createdUserIds.push(user.id);
  return user;
}

async function createStartedChat(serviceType = "chat") {
  const payer = await createUser("user");
  const listener = await createUser("listener");
  const now = new Date();
  const chat = await Chat.create({
    participant1Id: payer.id,
    participant2Id: listener.id,
    serviceType,
    status: "started",
    startedAt: now,
    lastMessageAt: now,
  });
  createdChatIds.push(chat.id);
  return { chat, payer, listener };
}

async function readAudit(chatId) {
  const chat = await Chat.findByPk(chatId);
  expect(chat).not.toBeNull();
  expect(chat.status).toBe("ended");
  return chat;
}

function createSocket(user) {
  const handlers = {};
  return {
    user: { id: user.id, role: user.role },
    handlers,
    on: jest.fn((event, callback) => {
      handlers[event] = callback;
    }),
    emit: jest.fn(),
    leave: jest.fn(),
    join: jest.fn(),
  };
}

beforeAll(() => {
  redisService.getChatSessionActivity.mockImplementation(
    async (chatId) => activityKeys.get(chatId) || null,
  );
  redisService.setChatSessionActivity.mockImplementation(
    async (chatId, payerId = null) => {
      activityKeys.set(chatId, {
        updatedAt: new Date().toISOString(),
        ...(payerId ? { payerId } : {}),
      });
    },
  );
  redisService.getChatSessionPayerId.mockImplementation(
    async (chatId) => activityKeys.get(chatId)?.payerId || null,
  );
  redisService.deleteChatSessionActivity.mockImplementation(async (chatId) =>
    activityKeys.delete(chatId),
  );
  redisService.acquireUserSessionLock = jest
    .fn()
    .mockResolvedValue("audit-lock");
  redisService.releaseUserSessionLock = jest.fn().mockResolvedValue();
  redisService.getUserBusyStatus = jest.fn().mockResolvedValue(null);
  redisService.isUserReachable = jest.fn().mockResolvedValue(true);
  redisService.isUserActiveInChat = jest.fn().mockResolvedValue(false);
});

beforeEach(() => {
  jest.clearAllMocks();
  createdUserIds = [];
  createdChatIds = [];
  activityKeys.clear();
  billingService.processConversationBilling = jest.fn().mockResolvedValue(null);
  walletService.getWalletBalance = jest.fn().mockResolvedValue(0);
  freeMinutesService.getUserFreeMinutesUsage = jest
    .fn()
    .mockResolvedValue({ remaining_seconds: 0 });
  callDurationMonitor.stopMonitoring = jest.fn().mockResolvedValue(0);
});

afterEach(async () => {
  if (createdChatIds.length) {
    await Chat.destroy({ where: { id: createdChatIds } });
  }
  if (createdUserIds.length) {
    await User.destroy({ where: { id: createdUserIds } });
  }
});

describe("chat end audit persistence", () => {
  it("persists manual actor and source through conversation:end", async () => {
    const { chat, payer } = await createStartedChat();
    const socket = createSocket(payer);
    conversationHandler(mockIO, socket);

    await socket.handlers["conversation:end"]({ conversationId: chat.id });

    const persisted = await readAudit(chat.id);
    expect(persisted.endReason).toBe("manual");
    expect(persisted.endedByUserId).toBe(payer.id);
    expect(persisted.endTriggerSource).toBe("conversation:end socket");
  });

  it("does not close a fresh chat after its Redis activity key is deleted", async () => {
    const { chat, payer } = await createStartedChat();
    await redisService.setChatSessionActivity(chat.id, payer.id);
    await redisService.deleteChatSessionActivity(chat.id);

    await chatSessionService.checkIdleSessions(mockIO);

    const persisted = await Chat.findByPk(chat.id);
    expect(persisted.status).toBe("started");
    expect(persisted.endReason).toBeNull();
  });

  it("closes an actually stale chat and persists inactivity audit fields", async () => {
    const { chat } = await createStartedChat();
    const staleAt = new Date(Date.now() - 301000);
    await sequelize.query(
      'UPDATE "chats" SET "createdAt" = $created, "started_at" = $created, "lastMessageAt" = $created WHERE "id" = $id',
      { bind: { created: staleAt, id: chat.id } },
    );
    activityKeys.set(chat.id, { updatedAt: staleAt.toISOString() });

    await chatSessionService.checkIdleSessions(mockIO);

    const persisted = await readAudit(chat.id);
    expect(persisted.endReason).toBe("inactivity");
    expect(persisted.endedByUserId).toBeNull();
    expect(persisted.endTriggerSource).toBe("chatSession.inactivityMonitor");
  });

  it("persists balance exhaustion through the actual send-message handler", async () => {
    const { chat, payer, listener } = await createStartedChat();
    await redisService.setChatSessionActivity(chat.id, payer.id);
    const socket = createSocket(payer);
    chatHandler(mockIO, socket);

    await socket.handlers["send-message"]({
      chatId: chat.id,
      receiverId: listener.id,
      content: "balance check",
    });

    const persisted = await readAudit(chat.id);
    expect(persisted.endReason).toBe("balance_exhausted");
    expect(persisted.endedByUserId).toBeNull();
    expect(persisted.endTriggerSource).toBe("chat.handler.balanceCheck");
  });

  it("persists call duration limit through the real conversation service", async () => {
    const { chat, payer, listener } = await createStartedChat("video_call");

    await callDurationMonitor._terminateCall(
      "audit-call-duration",
      chat.id,
      payer.id,
      listener.id,
      10,
      mockIO,
    );

    const persisted = await readAudit(chat.id);
    expect(persisted.endReason).toBe("call_duration_limit");
    expect(persisted.endedByUserId).toBeNull();
    expect(persisted.endTriggerSource).toBe(
      "callDurationMonitor._terminateCall",
    );
  });

  it.each([
    ["user_ended", "manual", true],
    ["reconnect_timeout", "disconnect", false],
    ["disconnect_before_join", "disconnect", false],
    ["zero_balance_at_connect", "balance_exhausted", false],
    ["inactivity_timeout", "inactivity", false],
    ["affordable_duration_exhausted", "call_duration_limit", false],
    ["join_timeout", "system", false],
  ])(
    "persists call lifecycle mapping %s as %s",
    async (trigger, expectedReason, manual) => {
      const { chat, payer, listener } = await createStartedChat("audio_call");
      const actorId = manual ? payer.id : null;

      await callLifecycle.endCall(
        `audit-${trigger}`,
        {
          conversationId: chat.id,
          senderId: payer.id,
          receiverId: listener.id,
          status: "started",
        },
        trigger,
        actorId,
      );

      const persisted = await readAudit(chat.id);
      expect(persisted.endReason).toBe(expectedReason);
      expect(persisted.endedByUserId).toBe(actorId);
      expect(persisted.endTriggerSource).toBe(
        `callLifecycle.endCall:${trigger}`,
      );
    },
  );
});
