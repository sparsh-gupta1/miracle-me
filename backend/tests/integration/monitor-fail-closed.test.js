const { Chat, User, Wallet, sequelize } = require("../../src/models");
const callDurationMonitorService = require("../../src/services/callDurationMonitor.service");
const chatSessionService = require("../../src/services/chatSession.service");
const conversationService = require("../../src/services/conversation.service");
const redisService = require("../../src/services/redis.service");

describe("Monitor Fail Closed (Call and Chat)", () => {
    let payer;
    let earner;
    let chatSession;
    let callSession;
    let mockIo;

    let inMemoryRedis = {};

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        
        payer = await User.create({ name: "Payer", role: "user", isBusy: false });
        earner = await User.create({ name: "Earner", role: "listener", isBusy: false });
        await Wallet.create({ userId: payer.id, balance: 100, type: "main" });
        await Wallet.create({ userId: earner.id, balance: 0, type: "earning" });
        
        jest.spyOn(redisService.client, 'hSet').mockImplementation(async (key, fieldOrObj, val) => {
            if (!inMemoryRedis[key]) inMemoryRedis[key] = {};
            if (typeof fieldOrObj === 'object') {
                Object.assign(inMemoryRedis[key], fieldOrObj);
            } else {
                inMemoryRedis[key][fieldOrObj] = val;
            }
            return 1;
        });
        jest.spyOn(redisService.client, 'hGetAll').mockImplementation(async (key) => {
            return inMemoryRedis[key] || {};
        });
        jest.spyOn(redisService.client, 'hGet').mockImplementation(async (key, field) => {
            return (inMemoryRedis[key] && inMemoryRedis[key][field]) || null;
        });
        jest.spyOn(redisService.client, 'del').mockImplementation(async (key) => {
            delete inMemoryRedis[key];
            return 1;
        });
        jest.spyOn(redisService.client, 'incr').mockImplementation(async (key) => {
            inMemoryRedis[key] = (parseInt(inMemoryRedis[key]) || 0) + 1;
            return inMemoryRedis[key];
        });
        jest.spyOn(redisService.client, 'get').mockImplementation(async (key) => {
            return inMemoryRedis[key] !== undefined ? String(inMemoryRedis[key]) : null;
        });
        jest.spyOn(redisService.client, 'set').mockImplementation(async (key, val) => {
            inMemoryRedis[key] = val;
            return "OK";
        });
        jest.spyOn(redisService.client, 'exists').mockImplementation(async (key) => {
            return inMemoryRedis[key] !== undefined ? 1 : 0;
        });
        jest.spyOn(redisService.client, 'expire').mockImplementation(async (key) => {
            return 1;
        });
    });

    beforeEach(async () => {
        inMemoryRedis = {};
        await Chat.destroy({ where: {} });

        mockIo = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn()
        };

        jest.spyOn(redisService, 'getUserStatus').mockResolvedValue({ socketId: 'test_socket' });
        jest.spyOn(redisService, 'getChatSessionPayerId').mockResolvedValue(payer.id);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        chatSessionService.stop();
        callDurationMonitorService.activeMonitors.forEach((monitor, key) => {
            clearInterval(monitor.intervalId);
        });
        callDurationMonitorService.activeMonitors.clear();
    });

    describe("Chat Session Monitor", () => {
        beforeEach(async () => {
            chatSession = await Chat.create({
                participant1Id: payer.id,
                participant2Id: earner.id,
                status: "started",
                serviceType: "chat",
                startedAt: new Date(Date.now() - 10000),
                connectedAt: new Date(Date.now() - 10000)
            });
            await redisService.client.hSet(`chat-monitor:${chatSession.id}`, 'affordableSeconds', '60');
            await redisService.client.del(`monitor-fail:${chatSession.id}`);
        });

        test("validation throws 3 times then succeeds (session survives)", async () => {
            let callCount = 0;
            jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockImplementation(async () => {
                callCount++;
                if (callCount <= 3) {
                    throw new Error("Temporary DB failure");
                }
                return { affordableSeconds: 60, hasSufficientBalance: true, pricingInfo: { pricing_id: 1, source: "mock" } };
            });

            await chatSessionService.checkActiveSessionBalances(mockIo);
            expect(await redisService.client.get(`monitor-fail:${chatSession.id}`)).toBe("1");
            let updatedChat = await Chat.findByPk(chatSession.id);
            expect(updatedChat.status).toBe("started");

            await chatSessionService.checkActiveSessionBalances(mockIo);
            expect(await redisService.client.get(`monitor-fail:${chatSession.id}`)).toBe("2");
            
            await chatSessionService.checkActiveSessionBalances(mockIo);
            expect(await redisService.client.get(`monitor-fail:${chatSession.id}`)).toBe("3");
            
            await chatSessionService.checkActiveSessionBalances(mockIo);
            const failCounter = await redisService.client.get(`monitor-fail:${chatSession.id}`);
            expect(failCounter).toBeNull();
            
            updatedChat = await Chat.findByPk(chatSession.id);
            expect(updatedChat.status).toBe("started");
        });

        test("validation throws 4+ times (session ends, billed for time used)", async () => {
            jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockImplementation(async () => {
                throw new Error("Persistent DB failure");
            });

            await chatSessionService.checkActiveSessionBalances(mockIo);
            await chatSessionService.checkActiveSessionBalances(mockIo);
            await chatSessionService.checkActiveSessionBalances(mockIo);
            
            let updatedChat = await Chat.findByPk(chatSession.id);
            expect(updatedChat.status).toBe("started");

            await chatSessionService.checkActiveSessionBalances(mockIo);
            
            updatedChat = await Chat.findByPk(chatSession.id);
            expect(updatedChat.status).toBe("ended");
            expect(updatedChat.endReason).toBe("balance_exhausted");
        });
    });

    describe("Call Session Monitor", () => {
        beforeEach(async () => {
            callSession = await Chat.create({
                participant1Id: payer.id,
                participant2Id: earner.id,
                status: "started",
                serviceType: "audio_call"
            });
            await callDurationMonitorService.startMonitoring(
                callSession.id,
                callSession.id,
                payer.id,
                earner.id,
                60,
                mockIo,
                "audio_call"
            );
            await redisService.client.hSet(`call-monitor:${callSession.id}`, 'lastBalanceCheckAt', new Date(Date.now() - 10000).toISOString());
            await redisService.client.del(`monitor-fail:${callSession.id}`);
        });

        test("validation throws 3 times then succeeds (session survives)", async () => {
            let callCount = 0;
            jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockImplementation(async () => {
                callCount++;
                if (callCount <= 3) {
                    throw new Error("Temporary DB failure");
                }
                return { affordableSeconds: 60, hasSufficientBalance: true, pricingInfo: { pricing_id: 1, source: "mock" } };
            });

            await callDurationMonitorService._checkDuration(callSession.id, mockIo);
            await redisService.client.hSet(`call-monitor:${callSession.id}`, 'lastBalanceCheckAt', new Date(Date.now() - 10000).toISOString());
            await callDurationMonitorService._checkDuration(callSession.id, mockIo);
            await redisService.client.hSet(`call-monitor:${callSession.id}`, 'lastBalanceCheckAt', new Date(Date.now() - 10000).toISOString());
            await callDurationMonitorService._checkDuration(callSession.id, mockIo);

            let updatedCall = await Chat.findByPk(callSession.id);
            expect(updatedCall.status).toBe("started");

            await redisService.client.hSet(`call-monitor:${callSession.id}`, 'lastBalanceCheckAt', new Date(Date.now() - 10000).toISOString());
            await callDurationMonitorService._checkDuration(callSession.id, mockIo);

            const failCounter = await redisService.client.get(`monitor-fail:${callSession.id}`);
            expect(failCounter).toBeNull();
            
            updatedCall = await Chat.findByPk(callSession.id);
            expect(updatedCall.status).toBe("started");
        });

        test("validation throws 4+ times (session ends, billed for time used)", async () => {
            jest.spyOn(conversationService, "validateBalanceAndCalculateDuration").mockImplementation(async () => {
                throw new Error("Persistent DB failure");
            });

            await callDurationMonitorService._checkDuration(callSession.id, mockIo);
            await redisService.client.hSet(`call-monitor:${callSession.id}`, 'lastBalanceCheckAt', new Date(Date.now() - 10000).toISOString());
            await callDurationMonitorService._checkDuration(callSession.id, mockIo);
            await redisService.client.hSet(`call-monitor:${callSession.id}`, 'lastBalanceCheckAt', new Date(Date.now() - 10000).toISOString());
            await callDurationMonitorService._checkDuration(callSession.id, mockIo);

            let updatedCall = await Chat.findByPk(callSession.id);
            expect(updatedCall.status).toBe("started");

            await redisService.client.hSet(`call-monitor:${callSession.id}`, 'lastBalanceCheckAt', new Date(Date.now() - 10000).toISOString());
            await callDurationMonitorService._checkDuration(callSession.id, mockIo);

            updatedCall = await Chat.findByPk(callSession.id);
            expect(updatedCall.status).toBe("ended");
            expect(updatedCall.endReason).toBe("call_duration_limit");
        });
    });
});
