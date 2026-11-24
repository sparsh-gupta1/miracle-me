describe("Billing Wallet Auto-Init and Charging", () => {
  let payer;
  let listener;
  let inMemoryRedis = {};
  let billingService;
  let freeMinutesService;
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
    freeMinutesService = require("../../src/services/freeMinutes.service");
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

  it("payer with NO wallet, paid chat of 120s, free minutes 0: billing debits payer", async () => {
    const { UserFreeMinutesUsage, Chat, Wallet, WalletTransaction, sequelize } = require("../../src/models");
    
    await UserFreeMinutesUsage.create({
      user_id: payer.id, service_type: "chat", total_free_seconds: 60, consumed_seconds: 60, remaining_seconds: 0
    });

    const chat = await Chat.create({
      participant1Id: payer.id, participant2Id: listener.id, serviceType: "chat", status: "started", startedAt: new Date(Date.now() - 120000)
    });

    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 60, source: "global" });
    
    const t = await sequelize.transaction();
    let error;
    try {
      await chat.update({ status: "ended", endedAt: new Date(), durationSeconds: 120 }, { transaction: t });
      await billingService.processConversationBilling(chat.id, payer.id, t);
      await t.commit();
    } catch (e) {
      error = e;
      await t.rollback();
    }

    if (error) throw error;

    const payerWallet = await Wallet.findOne({ where: { userId: payer.id } });
    expect(payerWallet).not.toBeNull();
    
    const transactions = await WalletTransaction.findAll({ where: { walletId: payerWallet.id } });
    expect(transactions.length).toBe(0); // since it got capped at 0 balance
  });

  it("payer WITH a wallet: same result", async () => {
    const { UserFreeMinutesUsage, Chat, Wallet, WalletTransaction, sequelize } = require("../../src/models");
    
    const payerWallet = await Wallet.create({ userId: payer.id, type: "main", balance: 500 });

    await UserFreeMinutesUsage.create({
      user_id: payer.id, service_type: "chat", total_free_seconds: 60, consumed_seconds: 60, remaining_seconds: 0
    });

    const chat = await Chat.create({
      participant1Id: payer.id, participant2Id: listener.id, serviceType: "chat", status: "started", startedAt: new Date(Date.now() - 120000)
    });

    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 60, source: "global" });
    
    const t = await sequelize.transaction();
    await chat.update({ status: "ended", endedAt: new Date(), durationSeconds: 120 }, { transaction: t });
    await billingService.processConversationBilling(chat.id, payer.id, t);
    await t.commit();

    const transactions = await WalletTransaction.findAll({ where: { walletId: payerWallet.id } });
    expect(transactions.length).toBeGreaterThan(0);
    expect(Number(transactions[0].amount)).toBe(120); // 120s at 60/min = 120
    expect(transactions[0].type).toBe("debit");
  });

  it("free minutes fully cover the session: no debit, free minutes consumed", async () => {
    const { UserFreeMinutesUsage, Chat, Wallet, WalletTransaction, sequelize } = require("../../src/models");
    
    const payerWallet = await Wallet.create({ userId: payer.id, type: "main", balance: 500 });

    await UserFreeMinutesUsage.create({
      user_id: payer.id, service_type: "chat", total_free_seconds: 120, consumed_seconds: 0, remaining_seconds: 120
    });

    const chat = await Chat.create({
      participant1Id: payer.id, participant2Id: listener.id, serviceType: "chat", status: "started", startedAt: new Date(Date.now() - 120000)
    });

    jest.spyOn(require("../../src/services/pricing.service"), "getEffectivePricing").mockResolvedValue({ pricePerMinute: 60, source: "global" });
    
    const t = await sequelize.transaction();
    await chat.update({ status: "ended", endedAt: new Date(), durationSeconds: 120 }, { transaction: t });
    await billingService.processConversationBilling(chat.id, payer.id, t);
    await t.commit();

    const transactions = await WalletTransaction.findAll({ where: { walletId: payerWallet.id } });
    expect(transactions.length).toBe(0);

    const usage = await UserFreeMinutesUsage.findOne({ where: { user_id: payer.id, service_type: "chat" }});
    expect(usage.consumed_seconds).toBe(120);
  });
});
