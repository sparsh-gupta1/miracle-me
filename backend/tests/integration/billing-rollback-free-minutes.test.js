describe("Billing Rollback Regression", () => {
  let payer;
  let listener;
  let inMemoryRedis = {};
  let billingService;
  const dbName = process.env.DB_NAME;

  beforeAll(async () => {
    if (dbName !== 'mirecleme_test') {
      console.log(`DB_NAME is ${dbName}, skipping/exiting`);
      process.exit(1);
    }
    
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
    
    billingService = require("../../src/services/billing.service");
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
    const { Chat, User, UserFreeMinutesUsage, Wallet, WalletTransaction, CommunicationCharge } = require("../../src/models");
    await CommunicationCharge.destroy({ where: {} });
    await WalletTransaction.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    await Chat.destroy({ where: {} });
    await User.destroy({ where: {} });
    await UserFreeMinutesUsage.destroy({ where: {} });
  });

  it("should rollback free minutes if wallet debit fails, but keep conversation ended", async () => {
    const { UserFreeMinutesUsage, Chat, Wallet, WalletTransaction, CommunicationCharge } = require("../../src/models");
    
    const payerWallet = await Wallet.create({ userId: payer.id, type: "main", balance: 500 });
    const listenerWallet = await Wallet.create({ userId: listener.id, type: "earning", balance: 0 });

    await UserFreeMinutesUsage.create({
      user_id: payer.id, service_type: "chat", total_free_seconds: 60, consumed_seconds: 0, remaining_seconds: 60
    });

    const chat = await Chat.create({
      participant1Id: payer.id, participant2Id: listener.id, serviceType: "chat", status: "started", startedAt: new Date(Date.now() - 120000)
    });

    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 60, source: "global" });
    
    const walletService = require("../../src/services/wallet.service");
    // Intercept debitWallet to simulate a failure AFTER free minutes are consumed
    jest.spyOn(walletService, 'debitWallet').mockRejectedValue(new Error("Simulated wallet failure"));

    const conversationService = require("../../src/services/conversation.service");
    
    // We mock chat duration by setting startedAt to 2 mins ago, 
    // and calling endConversation which will compute 120s duration.
    await conversationService.endConversation(chat.id, { reason: "manual", payerId: payer.id });

    // 1. Conversation should be ended
    const updatedChat = await Chat.findByPk(chat.id);
    expect(updatedChat.status).toBe("ended");

    // 2. Free minutes should be restored/rolled back
    const usage = await UserFreeMinutesUsage.findOne({ where: { user_id: payer.id, service_type: "chat" }});
    // It started at 0 consumed. If rolled back, should still be 0.
    expect(usage.consumed_seconds).toBe(0);

    // 3. No incorrect debit/credit
    const payerTransactions = await WalletTransaction.findAll({ where: { walletId: payerWallet.id } });
    expect(payerTransactions.length).toBe(0);
    
    const listenerTransactions = await WalletTransaction.findAll({ where: { walletId: listenerWallet.id } });
    expect(listenerTransactions.length).toBe(0);

    // 4. No incomplete billing record
    const charges = await CommunicationCharge.findAll({ where: { conversationId: chat.id } });
    expect(charges.length).toBe(0);
  });
});
