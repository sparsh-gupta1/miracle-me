require("dotenv").config();
const io = require("socket.io-client");
const http = require("http");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const JWT_TOKEN = process.env.TEST_JWT_TOKEN; // Set this in .env or replace with actual token

if (!JWT_TOKEN) {
  console.error(
    "❌ TEST_JWT_TOKEN is missing in environment. Please set it in .env"
  );
  process.exit(1);
}

// First, check if server is reachable
console.log("🔍 Checking if server is reachable...");
const url = new URL(SERVER_URL);
http
  .get(
    {
      hostname: url.hostname,
      port: url.port,
      path: "/",
      timeout: 5000,
    },
    (res) => {
      console.log(`✅ Server responded with status: ${res.statusCode}`);
      connectSocket();
    }
  )
  .on("error", (err) => {
    console.error(`❌ Server not reachable: ${err.message}`);
    console.log("Make sure your server is running with: npm run dev");
    process.exit(1);
  });

function connectSocket() {
  console.log("🔌 Connecting to WebSocket server...");

  const socket = io(SERVER_URL, {
    auth: {
      token: JWT_TOKEN,
    },
    transports: ["polling", "websocket"], // Try polling first
    timeout: 5000,
    forceNew: true,
  });

  let testResults = {
    text: false,
    image: false,
    video: false,
    voice: false,
  };

  // Handle connection
  socket.on("connect", () => {
    console.log("✅ Connected to server with ID:", socket.id);

    // Test 1: Send a text message
    console.log("📤 Testing text message...");
    socket.emit("send-message", {
      chatId: "7f529d2c-447f-47fe-adf7-2b03954c2533", // Replace with actual chat ID
      receiverId: "f77a635b-07e5-4ccc-acd3-ad1186ae29d3", // Replace with actual receiver ID
      content: "Hello, this is a test message!",
      messageType: "text",
    });

    // Test 2: Send an image message (using a small test image)
    console.log("📤 Testing image message...");
    try {
      // Create a small 1x1 pixel PNG as base64 for testing
      const testImageBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

      socket.emit("send-message", {
        chatId: "7f529d2c-447f-47fe-adf7-2b03954c2533", // Replace with actual chat ID
        receiverId: "f77a635b-07e5-4ccc-acd3-ad1186ae29d3", // Replace with actual receiver ID
        messageType: "image",
        file: testImageBase64,
        filename: "test-image.png",
        contentType: "image/png",
      });
    } catch (error) {
      console.error("❌ Error preparing image message:", error);
    }

    // Test 3: Send a video message (using mock data - may fail due to content validation)
    console.log("📤 Testing video message...");
    try {
      // Note: Using same test data as image - S3 may reject due to content-type mismatch
      const testVideoBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

      socket.emit("send-message", {
        chatId: "7f529d2c-447f-47fe-adf7-2b03954c2533", // Replace with actual chat ID
        receiverId: "f77a635b-07e5-4ccc-acd3-ad1186ae29d3", // Replace with actual receiver ID
        messageType: "video",
        file: testVideoBase64,
        filename: "test-video.mp4",
        contentType: "video/mp4",
      });
    } catch (error) {
      console.error("❌ Error preparing video message:", error);
    }

    // Test 4: Send a voice message (using mock data - may fail due to content validation)
    console.log("📤 Testing voice message...");
    try {
      const testVoiceBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

      socket.emit("send-message", {
        chatId: "7f529d2c-447f-47fe-adf7-2b03954c2533", // Replace with actual chat ID
        receiverId: "f77a635b-07e5-4ccc-acd3-ad1186ae29d3", // Replace with actual receiver ID
        messageType: "voice",
        file: testVoiceBase64,
        filename: "test-voice.mp3",
        contentType: "audio/mp3",
      });
    } catch (error) {
      console.error("❌ Error preparing voice message:", error);
    }
  });

  // Handle new-message events (responses from server)
  socket.on("new-message", (data) => {
    console.log("📨 Received new-message:", JSON.stringify(data, null, 2));

    // Track successful messages
    if (data.messageType === "text") testResults.text = true;
    else if (data.messageType === "image") testResults.image = true;
    else if (data.messageType === "video") testResults.video = true;
    else if (data.messageType === "voice") testResults.voice = true;
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected:", reason);

    // Show test summary
    console.log("\n📊 Test Results Summary:");
    console.log(`✅ Text messages: ${testResults.text ? "PASSED" : "FAILED"}`);
    console.log(
      `✅ Image messages: ${testResults.image ? "PASSED" : "FAILED"}`
    );
    console.log(
      `❌ Video messages: ${testResults.video ? "PASSED" : "FAILED (expected with test data)"}`
    );
    console.log(
      `❌ Voice messages: ${testResults.voice ? "PASSED" : "FAILED (expected with test data)"}`
    );

    console.log(
      "\n💡 Note: Video and voice tests use mock PNG data, which may be rejected by S3 content validation."
    );
    console.log(
      "   For real testing, use actual video/audio file data converted to base64."
    );
  });

  // Handle connection errors
  socket.on("connect_error", (error) => {
    console.error("❌ Connection error:", error.message);
    console.error("Full error:", error);
  });

  // Timeout after 15 seconds (increased for media processing)
  setTimeout(() => {
    console.log("⏰ Test timeout reached. Disconnecting...");
    socket.disconnect();
    process.exit(0);
  }, 15000);
}
