require("dotenv").config();
const { Database } = require("./src/config");
const redisClient = require("./src/config/redis");
const redisService = require("./src/services/redis.service");
const { User, Chat, ResponseWindow } = require("./src/models");
const penaltyService = require("./src/services/penalty.service");
const walletService = require("./src/services/wallet.service");

async function runTest() {
  console.log("Starting manual test for Penalty System...");

  await Database.testConnection();
  await Database.initModels();
  await redisService.connect(redisClient);
  
  // Start the BullMQ worker
  require("./src/workers/penalty.worker");
  console.log("Worker initialized.");

  try {
    // 1. Create a dummy user and listener
    const user = await User.create({
      name: "Test User",
      email: `user_${Date.now()}@test.com`,
      mobileNumber: `111${Date.now().toString().slice(-7)}`,
      role: "user",
      firebaseUid: `uid_u_${Date.now()}`
    });

    const listener = await User.create({
      name: "Test Listener",
      email: `listener_${Date.now()}@test.com`,
      mobileNumber: `222${Date.now().toString().slice(-7)}`,
      role: "listener",
      firebaseUid: `uid_l_${Date.now()}`
    });

    // Need wallets for the listener
    await walletService.createWallet(listener.id, "earning");

    // 2. Create a dummy Chat
    const chat = await Chat.create({
      participant1Id: user.id,
      participant2Id: listener.id,
      serviceType: "chat",
      status: "started",
    });

    console.log(`\n--- Test 1: Full 20-second penalty flow ---`);
    console.log(`Simulating user message at ${new Date().toISOString()}`);
    
    // Simulate user message triggering penalty tracking
    await penaltyService.startResponseWindow(chat.id, user.id, listener.id);
    
    console.log("Response window started in DB and Redis. Waiting 22 seconds for jobs to process...");

    // Wait 22 seconds to let both 15s warning and 20s penalty fire
    await new Promise((resolve) => setTimeout(resolve, 22000));

    // Check DB state
    const windowState1 = await ResponseWindow.findOne({ where: { chatId: chat.id, listenerId: listener.id } });
    console.log("Window State After 22s:", {
      status: windowState1.status,
      warningSent: windowState1.warningSent,
      penaltyApplied: windowState1.penaltyApplied,
      penaltySeconds: windowState1.penaltySeconds,
    });
    
    if (windowState1.penaltyApplied && windowState1.penaltySeconds === 20) {
      console.log("✅ Test 1 Passed: 20s Penalty was successfully applied.");
    } else {
      console.log("❌ Test 1 Failed: Penalty not applied correctly.");
    }

    console.log(`\n--- Test 2: Listener responds within 10 seconds ---`);
    
    // Create new users for Test 2 to avoid unique_chat_participants constraint
    const user2 = await User.create({
      name: "Test User 2",
      email: `user2_${Date.now()}@test.com`,
      mobileNumber: `333${Date.now().toString().slice(-7)}`,
      role: "user",
      firebaseUid: `uid_u2_${Date.now()}`
    });

    const listener2 = await User.create({
      name: "Test Listener 2",
      email: `listener2_${Date.now()}@test.com`,
      mobileNumber: `444${Date.now().toString().slice(-7)}`,
      role: "listener",
      firebaseUid: `uid_l2_${Date.now()}`
    });

    await walletService.createWallet(listener2.id, "earning");

    const chat2 = await Chat.create({
      participant1Id: user2.id,
      participant2Id: listener2.id,
      serviceType: "chat",
      status: "started",
    });

    await penaltyService.startResponseWindow(chat2.id, user2.id, listener2.id);
    console.log("Response window started. Waiting 5 seconds before replying...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    
    console.log("Listener replies!");
    await penaltyService.registerResponse(chat2.id);

    console.log("Waiting 16 more seconds to ensure warning/penalty jobs don't fire...");
    await new Promise((resolve) => setTimeout(resolve, 16000));

    const windowState2 = await ResponseWindow.findOne({ where: { chatId: chat2.id, listenerId: listener2.id } });
    console.log("Window State After Early Reply:", {
      status: windowState2.status,
      warningSent: windowState2.warningSent,
      penaltyApplied: windowState2.penaltyApplied,
    });

    if (windowState2.status === "responded" && !windowState2.warningSent && !windowState2.penaltyApplied) {
      console.log("✅ Test 2 Passed: Early reply prevented warning and penalty.");
    } else {
      console.log("❌ Test 2 Failed: Jobs fired improperly despite reply.");
    }

  } catch (error) {
    console.error("Test execution failed:", error);
  } finally {
    console.log("\nCleaning up connections...");
    const { penaltyWorker } = require("./src/workers/penalty.worker");
    const { penaltyQueue, connection } = require("./src/queues/penalty.queue");
    await penaltyWorker.close();
    await penaltyQueue.close();
    await connection.quit();
    await redisClient.quit();
    await Database.sequelize.close();
    process.exit(0);
  }
}

runTest();
