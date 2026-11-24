describe("Free Minutes Exhaustion Integration (Option A)", () => {
  let payer;
  let listener;
  let inMemoryRedis = {};
  let chatSessionService;
  let callDurationMonitor;
  let callLifecycle;
  let conversationService;

  beforeAll(async () => {
    jest.useFakeTimers();
    const redisService = require("../../src/services/redis.service");
    jest.spyOn(redisService.client, 'hSet').mockImplementation(async (key, val) => {
        if (!inMemoryRedis[key]) inMemoryRedis[key] = {};
        if (typeof val === 'object') {
            Object.assign(inMemoryRedis[key], val);
        } else {
            inMemoryRedis[key][arguments[1]] = arguments[2];
        }
        return 1;
    });
    jest.spyOn(redisService.client, 'hGetAll').mockImplementation(async (key) => inMemoryRedis[key] || {});
    jest.spyOn(redisService.client, 'set').mockImplementation(async (key, val) => { inMemoryRedis[key] = val; return "OK"; });
    jest.spyOn(redisService.client, 'get').mockImplementation(async (key) => inMemoryRedis[key] || null);
    jest.spyOn(redisService.client, 'del').mockImplementation(async (key) => { delete inMemoryRedis[key]; return 1; });
    jest.spyOn(redisService.client, 'exists').mockImplementation(async (key) => (inMemoryRedis[key] ? 1 : 0));
    
    chatSessionService = require("../../src/services/chatSession.service");
    callDurationMonitor = require("../../src/services/callDurationMonitor.service");
    callLifecycle = require("../../src/services/callLifecycle.service");
    conversationService = require("../../src/services/conversation.service");
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    inMemoryRedis = {};
    const { User } = require("../../src/models");
    const rand = Math.floor(Math.random() * 1000000);
    payer = await User.create({
      name: "Payer",
      email: `payer${rand}@example.com`,
      mobileNumber: `9${rand}`.padEnd(10, '0'),
      role: "user",
      isVerified: true,
    });
    listener = await User.create({
      name: "Listener",
      email: `listener${rand}@example.com`,
      mobileNumber: `8${rand}`.padEnd(10, '0'),
      role: "listener",
      isVerified: true,
    });
  });

  afterEach(async () => {
    const { Chat, User, UserFreeMinutesUsage } = require("../../src/models");
    await Chat.destroy({ where: {} });
    await User.destroy({ where: {} });
    await UserFreeMinutesUsage.destroy({ where: {} });
  });

  it("free = 60s, balance = 0, session ends at 60s with reason balance_exhausted", async () => {
    const { UserFreeMinutesUsage, Chat } = require("../../src/models");
    await UserFreeMinutesUsage.create({
      user_id: payer.id,
      service_type: "chat",
      total_free_seconds: 60,
      consumed_seconds: 0,
      remaining_seconds: 60
    });

    jest.spyOn(require("../../src/services/wallet.service"), "getWalletBalance").mockResolvedValue(0); 
    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 10 });

    const ioMock = { to: () => ({ emit: jest.fn() }), emit: jest.fn() };
    
    const chat = await Chat.create({
      participant1Id: payer.id,
      participant2Id: listener.id,
      serviceType: "chat",
      status: "started",
      startedAt: new Date(Date.now() - 61000),
      connectedAt: new Date(Date.now() - 61000)
    });

    jest.advanceTimersByTime(61000);

    await chatSessionService.checkActiveSessionBalances(ioMock);

    const updatedChat = await Chat.findByPk(chat.id);
    expect(updatedChat.status).toBe("ended");
    expect(updatedChat.endReason).toBe("balance_exhausted");
  });

  it("unanswered chat: ends after 60s with no_response and the free minute is untouched", async () => {
    const { UserFreeMinutesUsage, Chat } = require("../../src/models");
    const freeMinutesService = require("../../src/services/freeMinutes.service");
    await UserFreeMinutesUsage.create({
      user_id: payer.id,
      service_type: "chat",
      total_free_seconds: 60,
      consumed_seconds: 0,
      remaining_seconds: 60
    });

    jest.spyOn(require("../../src/services/wallet.service"), "getWalletBalance").mockResolvedValue(0);
    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 10 });

    const ioMock = { to: () => ({ emit: jest.fn() }), emit: jest.fn() };

    // The user messaged first; the listener never replied, so the chat never connected.
    const chat = await Chat.create({
      participant1Id: payer.id,
      participant2Id: listener.id,
      serviceType: "chat",
      status: "started",
      startedAt: new Date(Date.now() - 61000),
      connectedAt: null
    });

    await chatSessionService.checkActiveSessionBalances(ioMock);

    const updatedChat = await Chat.findByPk(chat.id);
    expect(updatedChat.status).toBe("ended");
    expect(updatedChat.endReason).toBe("no_response");
    expect(updatedChat.durationSeconds).toBe(0);

    const usage = await UserFreeMinutesUsage.findOne({ where: { user_id: payer.id, service_type: "chat" } });
    expect(usage.consumed_seconds).toBe(0);
    expect(await freeMinutesService.getUserFreeSecondsRemaining(payer.id, "chat")).toBe(60);
  });

  it("free = 60s, balance covers 5 more minutes, session stays active at 61s", async () => {
    const { UserFreeMinutesUsage, Chat } = require("../../src/models");
    await UserFreeMinutesUsage.create({
      user_id: payer.id,
      service_type: "chat",
      total_free_seconds: 60,
      consumed_seconds: 0,
      remaining_seconds: 60
    });

    jest.spyOn(require("../../src/services/wallet.service"), "getWalletBalance").mockResolvedValue(50); 
    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 10 });

    const ioMock = { to: () => ({ emit: jest.fn() }), emit: jest.fn() };
    
    const chat = await Chat.create({
      participant1Id: payer.id,
      participant2Id: listener.id,
      serviceType: "chat",
      status: "started",
      startedAt: new Date(Date.now() - 61000),
      connectedAt: new Date(Date.now() - 61000)
    });

    jest.advanceTimersByTime(61000);

    await chatSessionService.checkActiveSessionBalances(ioMock);

    const updatedChat = await Chat.findByPk(chat.id);
    expect(updatedChat.status).toBe("started"); // Still running
  });

  it("chat started, Redis payer key absent, free=60s, wallet=0, advance 66s, ends with balance_exhausted", async () => {
    const { UserFreeMinutesUsage, Chat } = require("../../src/models");
    await UserFreeMinutesUsage.create({
      user_id: payer.id,
      service_type: "chat",
      total_free_seconds: 60,
      consumed_seconds: 0,
      remaining_seconds: 60
    });

    jest.spyOn(require("../../src/services/wallet.service"), "getWalletBalance").mockResolvedValue(0); 
    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 10 });

    const ioMock = { to: () => ({ emit: jest.fn() }), emit: jest.fn() };
    
    const chat = await Chat.create({
      participant1Id: payer.id,
      participant2Id: listener.id,
      serviceType: "chat",
      status: "started",
      startedAt: new Date(Date.now() - 66000),
      connectedAt: new Date(Date.now() - 66000)
    });

    // Make sure redis returns null for this chat's payer ID (simulating absent key)
    const redisService = require("../../src/services/redis.service");
    jest.spyOn(redisService, 'getChatSessionPayerId').mockResolvedValue(null);

    jest.advanceTimersByTime(66000);

    await chatSessionService.checkActiveSessionBalances(ioMock);

    const updatedChat = await Chat.findByPk(chat.id);
    expect(updatedChat.status).toBe("ended");
    expect(updatedChat.endReason).toBe("balance_exhausted");
  });
});
