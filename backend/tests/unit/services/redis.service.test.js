jest.mock("../../../src/models", () => ({
  User: {
    findByPk: jest.fn(),
  },
}));

jest.unmock("../../../src/services/redis.service");
const redisService = require("../../../src/services/redis.service");
const { User } = require("../../../src/models");

describe("redis.service role sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisService.client = {
      hSet: jest.fn().mockResolvedValue(null),
      hDel: jest.fn().mockResolvedValue(null),
      expire: jest.fn().mockResolvedValue(null),
      persist: jest.fn().mockResolvedValue(null),
      sAdd: jest.fn().mockResolvedValue(1),
      sRem: jest.fn().mockResolvedValue(1),
      sCard: jest.fn().mockResolvedValue(0),
      del: jest.fn().mockResolvedValue(null),
      hGetAll: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(null),
    };
  });

  it("does not let a listener socket change manual availability", async () => {
    await redisService.setUserOnline("listener-1", "socket-42", "listener");

    expect(User.findByPk).not.toHaveBeenCalled();
    expect(redisService.client.sAdd).not.toHaveBeenCalled();
  });

  it("keeps a user online while another socket remains connected", async () => {
    redisService.client.sCard.mockResolvedValueOnce(1);

    const stillOnline = await redisService.removeUserSocket(
      "user-1",
      "socket-a",
      "user",
    );

    expect(stillOnline).toBe(true);
    expect(redisService.client.del).not.toHaveBeenCalled();
    expect(redisService.client.hSet).not.toHaveBeenCalled();
  });

  it("marks a user offline only after the final socket disconnects", async () => {
    redisService.client.sCard.mockResolvedValueOnce(0);

    const stillOnline = await redisService.removeUserSocket(
      "user-1",
      "socket-a",
      "user",
    );

    expect(stillOnline).toBe(false);
    expect(redisService.client.del).toHaveBeenCalledWith("user:user-1:sockets");
    expect(redisService.client.hSet).toHaveBeenCalledWith(
      "user:user-1:status",
      expect.objectContaining({ isOnline: "false" }),
    );
  });

  it("uses the database manual flag for listener status", async () => {
    redisService.client.hGetAll.mockResolvedValue({ isOnline: "true" });
    User.findByPk.mockResolvedValue({
      manualOffline: true,
      lastSeen: new Date("2025-01-01T00:00:00Z"),
    });

    const status = await redisService.getUserStatus("listener-1", "listener");

    expect(status.isOnline).toBe(false);
    expect(status.manualOffine).toBe(true);
  });

  it("uses active socket membership for user status, ignoring stale Redis online", async () => {
    redisService.client.hGetAll.mockResolvedValue({ isOnline: "true" });
    redisService.client.sCard.mockResolvedValue(0);

    const status = await redisService.getUserStatus("user-1", "user");

    expect(status.isOnline).toBe(false);
  });

  describe("atomic session locking", () => {
    it("acquireUserSessionLock locks successfully for EX 15", async () => {
      redisService.client.set.mockResolvedValue("OK");
      const token = await redisService.acquireUserSessionLock("user-1", "chat", "chat-42");
      expect(token).toBeTruthy();
      expect(redisService.client.set).toHaveBeenCalledWith(
        "user:user-1:session_lock",
        expect.stringContaining("user-1_chat-42_"),
        { NX: true, EX: 15 }
      );
    });

    it("acquireUserSessionLock returns null if already locked", async () => {
      redisService.client.set.mockResolvedValue(null);
      const token = await redisService.acquireUserSessionLock("user-1", "chat", "chat-42");
      expect(token).toBeNull();
    });

    it("releaseUserSessionLock uses eval to release lock", async () => {
      redisService.client.eval = jest.fn().mockResolvedValue(1);
      await redisService.releaseUserSessionLock("user-1", "fake-token");
      expect(redisService.client.eval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1] then'),
        { keys: ["user:user-1:session_lock"], arguments: ["fake-token"] }
      );
    });
  });
});
