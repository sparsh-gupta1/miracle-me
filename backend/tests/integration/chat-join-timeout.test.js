const { Chat, User, sequelize } = require("../../src/models");
const redisService = require("../../src/services/redis.service");
const callLifecycle = require("../../src/services/callLifecycle.service");

// Mocking dependencies that might be used
jest.mock("../../src/config/websocket", () => ({
  getIO: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  })),
}));

// We only need the handler function for socket.on
const callRequestHandlerInit = require("../../src/websocket/handlers/callRequest.handler");

describe("Chat Join Timeout Integration", () => {
  let payer;
  let listener;
  let chat;

  let inMemoryRedis = {};

  beforeAll(async () => {
    jest.useFakeTimers();
    await sequelize.sync({ force: true });
    
    // Setup in-memory mock for redis
    jest.spyOn(redisService.client, 'hSet').mockImplementation(async (key, val) => {
        if (!inMemoryRedis[key]) inMemoryRedis[key] = {};
        if (typeof val === 'object') {
            Object.assign(inMemoryRedis[key], val);
        } else {
            const field = arguments[1];
            const value = arguments[2];
            inMemoryRedis[key][field] = value;
        }
        return 1;
    });
    jest.spyOn(redisService.client, 'hGetAll').mockImplementation(async (key) => {
        return inMemoryRedis[key] || {};
    });
    jest.spyOn(redisService.client, 'set').mockImplementation(async (key, val) => {
        inMemoryRedis[key] = val;
        return "OK";
    });
    jest.spyOn(redisService.client, 'get').mockImplementation(async (key) => {
        return inMemoryRedis[key] || null;
    });
    jest.spyOn(redisService.client, 'del').mockImplementation(async (key) => {
        delete inMemoryRedis[key];
        return 1;
    });
    jest.spyOn(redisService.client, 'keys').mockImplementation(async (pattern) => {
        return Object.keys(inMemoryRedis);
    });
  });

  afterAll(async () => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    inMemoryRedis = {};

    payer = await User.create({
      name: "Test Caller",
      email: "test_caller@example.com",
      mobileNumber: "1234567890",
      password: "password123",
      role: "user",
      isVerified: true,
    });
    listener = await User.create({
      name: "Test Receiver",
      email: "test_receiver@example.com",
      mobileNumber: "0987654321",
      password: "password123",
      role: "listener",
      isVerified: true,
    });
    chat = await Chat.create({
      participant1Id: payer.id,
      participant2Id: listener.id,
      status: "started",
      serviceType: "chat", // Will test both chat and audio_call
    });
  });

  afterEach(async () => {
    await Chat.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  it("chat accepted, 35s passes, chat is NOT cancelled by join_timeout", async () => {
    // Setup socket mock
    const socketEvents = {};
    const mockSocket = {
      id: "socket_123",
      on: (event, handler) => {
        socketEvents[event] = handler;
      },
      emit: jest.fn(),
    };
    
    // Call the handler initializer
    callRequestHandlerInit(jest.fn()(), mockSocket, listener.id.toString());
    
    // Mock the redis data for the call request
    const requestId = "req_chat_123";
    await redisService.client.hSet(`call:${requestId}`, {
      status: "sent",
      senderId: payer.id.toString(),
      receiverId: listener.id.toString(),
      conversationId: chat.id.toString(),
      serviceType: "chat",
      balanceInfo: JSON.stringify({}),
    });

    // Mock acceptCallRequest and getOrCreateChat since we don't want to test the full flow
    const CallRequestService = require("../../src/services/callRequest.service");
    const chatService = require("../../src/services/chat.service");
    
    jest.spyOn(CallRequestService, "acceptCallRequest").mockResolvedValue({ success: true });
    jest.spyOn(chatService, "getOrCreateChat").mockResolvedValue(chat);

    // Call the accept handler
    await socketEvents["call-request:accept"]({ request_id: requestId });

    // Ensure the join timeout was NOT set for chat
    const timeoutKey = `call:${requestId}:join_timeout`;
    const timeoutVal = await redisService.client.get(timeoutKey);
    expect(timeoutVal).toBeNull();

    // Fast-forward time
    jest.advanceTimersByTime(35000);

    // Assert that endCall was not called
    const spyEndCall = jest.spyOn(callLifecycle, "endCall");
    expect(spyEndCall).not.toHaveBeenCalled();
    
    const freshData = await redisService.client.hGetAll(`call:${requestId}`);
    expect(freshData.status).toBe("accepted"); // remains accepted, not ended by timeout
  });

  it("audio call never connects, ends with join_timeout and duration 0", async () => {
    const socketEvents = {};
    const mockSocket = {
      id: "socket_123",
      on: (event, handler) => {
        socketEvents[event] = handler;
      },
      emit: jest.fn(),
    };
    
    callRequestHandlerInit(jest.fn()(), mockSocket, listener.id.toString());
    
    const requestId = "req_audio_123";
    await redisService.client.hSet(`call:${requestId}`, {
      status: "sent",
      senderId: payer.id.toString(),
      receiverId: listener.id.toString(),
      conversationId: chat.id.toString(),
      serviceType: "audio_call",
      balanceInfo: JSON.stringify({}),
    });

    const CallRequestService = require("../../src/services/callRequest.service");
    const chatService = require("../../src/services/chat.service");
    const agoraService = require("../../src/services/agora.service");
    
    jest.spyOn(CallRequestService, "acceptCallRequest").mockResolvedValue({ success: true });
    jest.spyOn(chatService, "getOrCreateChat").mockResolvedValue(chat);
    jest.spyOn(agoraService, "isConfigured").mockReturnValue(false); // don't mock generation fully

    const spyEndCall = jest.spyOn(callLifecycle, "endCall");
    
    // Call the accept handler
    await socketEvents["call-request:accept"]({ request_id: requestId });

    // Ensure the join timeout WAS set for audio_call
    const timeoutKey = `call:${requestId}:join_timeout`;
    const timeoutVal = await redisService.client.get(timeoutKey);
    expect(timeoutVal).toBe("pending");

    // Let the event loop clear pending promises before advancing time
    await Promise.resolve();
    
    // Fast-forward time to trigger timeout
    jest.advanceTimersByTime(35000);

    // Let any async code in setTimeout run
    await Promise.resolve();

    // The call should be ended
    expect(spyEndCall).toHaveBeenCalledWith(requestId, expect.any(Object), "join_timeout");
  });

  it("chat accepted, socket disconnects, chat stays accepted (ignored by markDisconnected)", async () => {
    const requestId = "req_chat_disc_123";
    await redisService.client.hSet(`call:${requestId}`, {
      status: "accepted",
      senderId: payer.id.toString(),
      receiverId: listener.id.toString(),
      conversationId: chat.id.toString(),
      serviceType: "chat",
      balanceInfo: JSON.stringify({}),
    });

    const spyEndCall = jest.spyOn(callLifecycle, "endCall");
    
    // Simulate disconnect using markDisconnected
    await callLifecycle.markDisconnected(requestId, listener.id.toString(), "socket_disconnect");

    expect(spyEndCall).not.toHaveBeenCalled();

    const freshData = await redisService.client.hGetAll(`call:${requestId}`);
    expect(freshData.status).toBe("accepted"); // status should remain accepted
  });

  it("audio call accepted, disconnects before join, still ends with no charge", async () => {
    const requestId = "req_audio_disc_123";
    await redisService.client.hSet(`call:${requestId}`, {
      status: "accepted",
      senderId: payer.id.toString(),
      receiverId: listener.id.toString(),
      conversationId: chat.id.toString(),
      serviceType: "audio_call",
      balanceInfo: JSON.stringify({}),
    });

    const spyEndCall = jest.spyOn(callLifecycle, "endCall");
    
    // Simulate disconnect using markDisconnected
    await callLifecycle.markDisconnected(requestId, listener.id.toString(), "socket_disconnect");

    expect(spyEndCall).toHaveBeenCalledWith(requestId, expect.any(Object), "disconnect_before_join");
  });

  it("chat accepted, caller socket disconnects, request and Redis keys remain", async () => {
    const socketEvents = {};
    const mockSocket = {
      id: "socket_caller_123",
      on: (event, handler) => {
        socketEvents[event] = handler;
      },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    
    callRequestHandlerInit(jest.fn()(), mockSocket, payer.id.toString());
    
    const requestId = "req_chat_caller_disc_123";
    
    // Set socket_to_call mapping
    await redisService.client.set(`socket_to_call:${mockSocket.id}`, requestId);
    
    await redisService.client.hSet(`call:${requestId}`, {
      status: "accepted",
      senderId: payer.id.toString(),
      receiverId: listener.id.toString(),
      callerSocketId: mockSocket.id, // caller socket
      conversationId: chat.id.toString(),
      serviceType: "chat",
      balanceInfo: JSON.stringify({}),
    });

    const CallRequestService = require("../../src/services/callRequest.service");
    const spyCancel = jest.spyOn(CallRequestService, "cancelCallRequest");

    // Call the disconnect handler
    await socketEvents["disconnect"]();

    // Verify chat was not cancelled
    expect(spyCancel).not.toHaveBeenCalled();

    // Redis keys should remain (though socket_to_call is deleted)
    const freshData = await redisService.client.hGetAll(`call:${requestId}`);
    expect(freshData.status).toBe("accepted");
  });
});
