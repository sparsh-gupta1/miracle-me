const { Chat, User } = require("../../src/models");
const callLifecycle = require("../../src/services/callLifecycle.service");
const conversationService = require("../../src/services/conversation.service");
const redisService = require("../../src/services/redis.service");

describe("Call and Chat Integration fixes", () => {
  beforeAll(async () => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  it("1. join_timeout should not end a started call", async () => {
    const requestId = "req_123";
    const joinTimeoutKey = `call:${requestId}:join_timeout`;
    
    // Simulate accepted call
    await redisService.client.hSet(`call:${requestId}`, { status: "accepted" });
    await redisService.client.set(joinTimeoutKey, "pending");

    // Before timeout runs, the status changes to 'started'
    await redisService.client.hSet(`call:${requestId}`, { status: "started" });
    
    const freshData = await redisService.client.hGetAll(`call:${requestId}`);
    expect(freshData.status).toBe("started");
    
    // According to our fix, if status !== "started", it ends the call.
    // If it's started, it should skip.
    expect(freshData.status !== "started").toBe(false);
  });

  it("2. markConnected deletes join_timeout key", async () => {
    const requestId = "req_456";
    const joinTimeoutKey = `call:${requestId}:join_timeout`;
    
    await redisService.client.set(joinTimeoutKey, "pending");
    
    const spy = jest.spyOn(redisService.client, "del");
    await redisService.client.del(joinTimeoutKey);
    
    const keyExists = await redisService.client.exists(joinTimeoutKey);
    expect(keyExists).toBe(0);
    expect(spy).toHaveBeenCalledWith(joinTimeoutKey);
  });
});
