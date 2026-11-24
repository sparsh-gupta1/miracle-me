const chatSessionService = require("../../../src/services/chatSession.service");
const conversationService = require("../../../src/services/conversation.service");
const redisService = require("../../../src/services/redis.service");
const { Chat } = require("../../../src/models");

const createChat = (ageMs) => {
  const activityAt = new Date(Date.now() - ageMs);
  return {
    id: "chat-1",
    status: "started",
    serviceType: "chat",
    createdAt: activityAt,
    startedAt: activityAt,
    lastMessageAt: activityAt,
    participant1Id: "payer-1",
    participant2Id: "listener-1",
  };
};

describe("ChatSessionService inactivity handling", () => {
  let io;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(conversationService, "endConversation").mockResolvedValue({
      conversation: { durationSeconds: 0 },
      billing: null,
    });
    io = { to: jest.fn(() => ({ emit: jest.fn() })) };
  });

  it("does not close a fresh chat when its Redis activity key is absent", async () => {
    const chat = createChat(10000);
    jest.spyOn(Chat, "findAll").mockResolvedValue([chat]);
    redisService.getChatSessionActivity.mockResolvedValue(null);

    await chatSessionService.checkIdleSessions(io);

    expect(conversationService.endConversation).not.toHaveBeenCalled();
  });

  it("ends an inactive chat after five minutes and records the inactivity source", async () => {
    const chat = createChat(301000);
    jest.spyOn(Chat, "findAll").mockResolvedValue([chat]);
    jest.spyOn(Chat, "findByPk").mockResolvedValue(chat);
    redisService.getChatSessionActivity.mockResolvedValue(null);
    redisService.getChatSessionPayerId.mockResolvedValue(null);
    conversationService.endConversation.mockResolvedValue({
      conversation: chat,
      billing: null,
    });

    await chatSessionService.checkIdleSessions(io);

    expect(conversationService.endConversation).toHaveBeenCalledWith("chat-1", {
      payerId: null,
      pausedSeconds: 0,
      io,
      reason: "inactivity",
      source: "chatSession.inactivityMonitor",
    });
  });

  describe("chats waiting for the first reply", () => {
    const unconnectedChat = (ageMs) => ({ ...createChat(ageMs), connectedAt: null });

    beforeEach(() => {
      jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockResolvedValue({ affordableSeconds: 60 });
    });

    it("ends an unanswered chat after 60s with no_response and does not bill", async () => {
      const chat = unconnectedChat(61000);
      jest.spyOn(Chat, "findAll").mockResolvedValue([chat]);
      jest.spyOn(Chat, "findByPk").mockResolvedValue(chat);
      redisService.getChatSessionPayerId.mockResolvedValue("payer-1");
      conversationService.endConversation.mockResolvedValue({ conversation: chat, billing: null });

      await chatSessionService.checkActiveSessionBalances(io);

      expect(conversationService.endConversation).toHaveBeenCalledWith("chat-1", {
        payerId: "payer-1",
        pausedSeconds: 0,
        io,
        reason: "no_response",
        source: "chatSession.noReplyMonitor",
      });
      expect(conversationService.validateBalanceAndCalculateDuration).not.toHaveBeenCalled();
      // Both users hear about it even if they left the chat screen, and the session state is cleaned up.
      expect(io.to).toHaveBeenCalledWith(["chat:chat-1", "user:payer-1", "user:listener-1"]);
      expect(redisService.deleteChatSessionActivity).toHaveBeenCalledWith("chat-1");
    });

    it("leaves a young unanswered chat alone and sends no duration warning", async () => {
      jest.spyOn(Chat, "findAll").mockResolvedValue([unconnectedChat(30000)]);

      await chatSessionService.checkActiveSessionBalances(io);

      expect(conversationService.endConversation).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });

    it("measures a connected chat from connectedAt, not from the first message", async () => {
      // Opened 10 minutes ago, answered 30s ago: 30s of a 60s budget used, so it keeps running.
      const chat = { ...createChat(600000), connectedAt: new Date(Date.now() - 30000) };
      jest.spyOn(Chat, "findAll").mockResolvedValue([chat]);
      redisService.getChatSessionPayerId.mockResolvedValue("payer-1");

      await chatSessionService.checkActiveSessionBalances(io);

      expect(conversationService.endConversation).not.toHaveBeenCalled();
    });
  });

  it("forwards balance exhaustion reason and source to the end service", async () => {
    const chat = createChat(10000);
    jest.spyOn(Chat, "findByPk").mockResolvedValue(chat);
    redisService.getChatSessionPayerId.mockResolvedValue("payer-1");
    conversationService.endConversation.mockResolvedValue({
      conversation: chat,
      billing: null,
    });

    await chatSessionService.endChatSession(
      "chat-1",
      io,
      "balance_exhausted",
      "chat.handler.balanceCheck",
    );

    expect(conversationService.endConversation).toHaveBeenCalledWith("chat-1", {
      payerId: "payer-1",
      pausedSeconds: 0,
      io,
      reason: "balance_exhausted",
      source: "chat.handler.balanceCheck",
    });
  });

  describe("when free minutes run out", () => {
    let emits;

    beforeEach(() => {
      emits = [];
      io = {
        to: jest.fn((rooms) => ({
          emit: jest.fn((event, payload) => emits.push({ rooms, event, payload })),
        })),
      };
    });

    it("prompts the payer to recharge even for a fully free session (no debit)", async () => {
      const chat = createChat(10000);
      jest.spyOn(Chat, "findByPk").mockResolvedValue(chat);
      redisService.getChatSessionPayerId.mockResolvedValue("payer-1");
      conversationService.endConversation.mockResolvedValue({
        conversation: { ...chat, durationSeconds: 60 },
        billing: null,
      });

      await chatSessionService.endChatSession("chat-1", io, "balance_exhausted", "chatSession.balanceMonitor");

      const prompts = emits.filter((e) => e.event === "wallet:recharge_required");
      expect(prompts).toHaveLength(1);
      expect(prompts[0].rooms).toBe("user:payer-1");
      expect(prompts[0].payload).toEqual(expect.objectContaining({ balanceAfter: 0, freeSecondsRemaining: 0, serviceType: "chat" }));
    });

    it("tells both users the chat ended, not only the chat room", async () => {
      const chat = createChat(10000);
      jest.spyOn(Chat, "findByPk").mockResolvedValue(chat);
      redisService.getChatSessionPayerId.mockResolvedValue("payer-1");
      conversationService.endConversation.mockResolvedValue({
        conversation: { ...chat, durationSeconds: 60 },
        billing: null,
      });

      await chatSessionService.endChatSession("chat-1", io, "balance_exhausted", "chatSession.balanceMonitor");

      const [ended] = emits.filter((e) => e.event === "chat-session-ended");
      expect(ended.rooms).toEqual(["chat:chat-1", "user:payer-1", "user:listener-1"]);
      expect(ended.payload).toEqual(expect.objectContaining({ reason: "balance_exhausted", durationSeconds: 60 }));
    });

    it("does not prompt for recharge when the chat ended for inactivity", async () => {
      const chat = createChat(10000);
      jest.spyOn(Chat, "findByPk").mockResolvedValue(chat);
      redisService.getChatSessionPayerId.mockResolvedValue("payer-1");
      conversationService.endConversation.mockResolvedValue({ conversation: chat, billing: null });

      await chatSessionService.endChatSession("chat-1", io, "inactivity", "chatSession.idle");

      expect(emits.filter((e) => e.event === "wallet:recharge_required")).toHaveLength(0);
    });
  });
});

describe("ChatSessionService balance monitor passes", () => {
  const connectedChat = (id) => ({
    ...createChat(600000),
    id,
    participant1Id: `payer-${id}`,
    connectedAt: new Date(Date.now() - 30000),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionService._inFlight = {};
    chatSessionService._skipped = {};
    jest.spyOn(conversationService, "endConversation").mockResolvedValue({ conversation: {}, billing: null });
    jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockResolvedValue({ affordableSeconds: 3600 });
  });

  it("skips a tick while the previous pass of the same kind is still running", async () => {
    let finish;
    const pass = jest.fn(() => new Promise((resolve) => { finish = resolve; }));

    const first = chatSessionService._runExclusive("balance", pass, 5000);
    await chatSessionService._runExclusive("balance", pass, 5000);

    expect(pass).toHaveBeenCalledTimes(1);
    expect(chatSessionService._skipped.balance).toBe(1);

    finish();
    await first;
    // The overrun is reported once and the counter resets; the next tick runs again.
    expect(chatSessionService._skipped.balance).toBe(0);
    await chatSessionService._runExclusive("balance", jest.fn().mockResolvedValue(), 5000);
    expect(chatSessionService._inFlight.balance).toBe(false);
  });

  it("keeps checking the other chats when one chat's check fails", async () => {
    jest.spyOn(Chat, "findAll").mockResolvedValue([connectedChat("a"), connectedChat("b")]);
    redisService.getChatSessionPayerId.mockImplementation(async (chatId) => {
      if (chatId === "a") throw new Error("redis down");
      return "payer-b";
    });

    await chatSessionService.checkActiveSessionBalances({ to: jest.fn(() => ({ emit: jest.fn() })) });

    expect(conversationService.validateBalanceAndCalculateDuration).toHaveBeenCalledTimes(1);
    expect(conversationService.validateBalanceAndCalculateDuration).toHaveBeenCalledWith(
      "payer-b", "listener-1", "chat", { readOnly: true },
    );
  });
});
