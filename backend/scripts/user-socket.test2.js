require("dotenv").config();
const io = require("socket.io-client");
const http = require("http");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
// const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImI1NWU3MmYzLTk0ZWYtNDViMy1hMjM4LWQ5OGYyZGNlNzM1OCIsIm1vYmlsZU51bWJlciI6Ijk5OTk5OTk5OTEiLCJyb2xlIjoibGlzdGVuZXIiLCJpYXQiOjE3Njc5Mzc3NzUsImV4cCI6MTc3MDUyOTc3NX0.fDXcZxEFdNd0zy-S2ezKW8L4fOZ1_s3GhPqvG5DIkPY' 
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImY1YjkxYTE2LTllOGEtNDU5MC1iZDY5LWRkYzFkZTgwN2RhYiIsIm1vYmlsZU51bWJlciI6Ijk5OTk5OTk5OTIiLCJyb2xlIjoidXNlciIsImlhdCI6MTc2NzkzNzkxNiwiZXhwIjoxNzcwNTI5OTE2fQ.emhWOg1B6uoCZ8u-gWltIJwgD2ZyoixIy_TGujszWkk'

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

  // Handle connection
  socket.on("connect", () => {
    console.log("✅ Connected to server with ID:", socket.id);
  })

   // Handle new-message events (responses from server)
  socket.on("new-message", (data) => {
    console.log("📨 Received new-message:", JSON.stringify(data, null, 2));
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log("🔌 Disconnected:", reason);
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
  }, 150000);
}

