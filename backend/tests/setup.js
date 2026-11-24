// Set test environment variables BEFORE loading any models
process.env.NODE_ENV = "test";
process.env.DB_NAME = "mirecleme_test";
process.env.ENABLE_SMS = "false"; // Disable real SMS during tests

// Test setup file
require("dotenv").config({ path: ".env" });

// Re-verify that DB_NAME is set to the test database
process.env.DB_NAME = "mirecleme_test";

// Mock Redis Service globally for all tests
jest.mock("../src/services/redis.service", () => {
    const mockClient = {
        connect: jest.fn().mockResolvedValue(),
        hSet: jest.fn().mockResolvedValue(1),
        hGet: jest.fn().mockResolvedValue(null),
        hDel: jest.fn().mockResolvedValue(1),
        hGetAll: jest.fn().mockResolvedValue({}),
        expire: jest.fn().mockResolvedValue(true),
        exists: jest.fn().mockResolvedValue(0),
        persist: jest.fn().mockResolvedValue(true),
        del: jest.fn().mockResolvedValue(1),
        set: jest.fn().mockResolvedValue("OK"),
        get: jest.fn().mockResolvedValue(null),
        ttl: jest.fn().mockResolvedValue(300),
        sAdd: jest.fn().mockResolvedValue(1),
        sRem: jest.fn().mockResolvedValue(1),
        sMembers: jest.fn().mockResolvedValue([]),
        sIsMember: jest.fn().mockResolvedValue(false),
        sCard: jest.fn().mockResolvedValue(0),
        incr: jest.fn().mockResolvedValue(1),
        keys: jest.fn().mockResolvedValue([]),
        // node-redis v5: an async iterator of key batches. Empty by default.
        scanIterator: jest.fn().mockImplementation(async function* () {}),
        quit: jest.fn().mockResolvedValue(),
        duplicate: jest.fn().mockImplementation(function() { return this; }),
    };

    return {
        client: mockClient,
        subscriber: mockClient,
        publisher: mockClient,
        connect: jest.fn().mockResolvedValue(),
        setUserOnline: jest.fn().mockResolvedValue(),
        refreshUserSocket: jest.fn().mockResolvedValue(),
        removeUserSocket: jest.fn().mockResolvedValue(false),
        setUserOffline: jest.fn().mockResolvedValue(),
        setManualUserOnline: jest.fn().mockResolvedValue(),
        getUserStatus: jest.fn().mockResolvedValue({ isOnline: false, socketId: null, lastSeen: null, manualOffine: false }),
        setUserActiveInChat: jest.fn().mockResolvedValue(),
        removeUserFromActiveChat: jest.fn().mockResolvedValue(),
        getChatActiveUsers: jest.fn().mockResolvedValue([]),
        isUserActiveInChat: jest.fn().mockResolvedValue(false),
        getUserActiveChat: jest.fn().mockResolvedValue(null),
        cacheMessage: jest.fn().mockResolvedValue(),
        getCachedMessage: jest.fn().mockResolvedValue(null),
        addUserToRoom: jest.fn().mockResolvedValue(),
        removeUserFromRoom: jest.fn().mockResolvedValue(),
        getRoomUsers: jest.fn().mockResolvedValue([]),
        setUserTyping: jest.fn().mockResolvedValue(),
        getTypingUsers: jest.fn().mockResolvedValue([]),
        incrementUnreadCount: jest.fn().mockResolvedValue(),
        getUnreadCount: jest.fn().mockResolvedValue(0),
        resetUnreadCount: jest.fn().mockResolvedValue(),
        getAllUnreadCounts: jest.fn().mockResolvedValue({}),
        publish: jest.fn().mockResolvedValue(),
        subscribe: jest.fn().mockResolvedValue(),
        setUserVideoCallStatus: jest.fn().mockResolvedValue(),
        getUserVideoCallStatus: jest.fn().mockResolvedValue(null),
        setUserBusyStatus: jest.fn().mockResolvedValue(),
        clearUserBusyStatus: jest.fn().mockResolvedValue(),
        setChatSessionActivity: jest.fn().mockResolvedValue(),
        getChatSessionActivity: jest.fn().mockResolvedValue(null),
        getChatSessionPayerId: jest.fn().mockResolvedValue(null),
        deleteChatSessionActivity: jest.fn().mockResolvedValue(),
        set: jest.fn().mockResolvedValue(),
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(),
        disconnect: jest.fn().mockResolvedValue(),
    };
});

const { sequelize } = require("../src/models");

// Save the original close method
const originalClose = sequelize.close.bind(sequelize);

// Override close method to be a no-op during individual test suites
sequelize.close = async () => {
    // No-op to prevent individual suites from closing the global pool
};

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
    console.log("Starting test suite on database:", process.env.DB_NAME);
    
    // Pre-create enum type if it does not exist
    try {
        await sequelize.query('CREATE TYPE "enum_pricing_service_type" AS ENUM (\'chat\', \'audio_call\', \'video_call\');');
        console.log("Pre-created enum type 'enum_pricing_service_type' for testing.");
    } catch (e) {
        // Ignore error if type already exists
    }

    // Sync the database once at the start of the serial test run
    await sequelize.sync({ force: true });
    console.log("Database synchronized for testing.");
});

// Global test teardown
afterAll(async () => {
    console.log("Test suite completed.");
    // Clean up and close connection pool once at the end
    await originalClose();
});
