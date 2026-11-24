const chatController = require("../../../src/controllers/chat.controller");
const {
  User,
  UserFavorite,
  UserBlockList,
  Chat,
  ChatSetting,
} = require("../../../src/models");
const redisService = require("../../../src/services/redis.service");

jest.mock("../../../src/models", () => ({
  User: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  UserFavorite: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
  UserBlockList: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
  Chat: {
    findOne: jest.fn(),
  },
  ChatSetting: {},
}));

jest.mock("../../../src/services/redis.service", () => ({
  getUserStatus: jest
    .fn()
    .mockResolvedValue({ isOnline: false, lastSeen: null }),
  getRawUserStatus: jest.fn().mockResolvedValue({
    isOnline: false,
    manualOffine: false,
    lastSeen: null,
  }),
}));

jest.mock("../../../src/services/s3.service", () => ({
  getDownloadUrl: jest.fn(),
}));

describe("chat.controller.newUserForChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findAll.mockResolvedValue([
      {
        id: "listener-2",
        name: "Alice Listener",
        email: "alice@example.com",
        isOnline: true,
        lastSeen: null,
        profileImage: null,
        role: "listener",
      },
    ]);
    UserBlockList.findAll.mockResolvedValue([]);
    UserFavorite.findOne.mockResolvedValue(null);
    Chat.findOne.mockResolvedValue(null);
  });

  it("should avoid an expensive count query for the default empty search filter", async () => {
    const req = {
      user: { id: "user-1" },
      query: { page: "1", limit: "20", q: "", filter: "all" },
      params: { roleid: "2" },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await chatController.newUserForChat(req, res, next);

    expect(User.findAndCountAll).not.toHaveBeenCalled();
    expect(User.findAll).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          users: expect.any(Array),
          hasMore: false,
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should include role in the list query so online status resolves correctly", async () => {
    const req = {
      user: { id: "user-1" },
      query: { page: "1", limit: "20", q: "", filter: "all" },
      params: { roleid: "2" },
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    redisService.getUserStatus.mockResolvedValueOnce({
      isOnline: true,
      lastSeen: new Date("2026-08-18T12:00:00Z"),
    });
    redisService.getRawUserStatus.mockResolvedValueOnce({
      isOnline: true,
      manualOffine: false,
      lastSeen: new Date("2026-08-18T12:00:00Z"),
    });

    await chatController.newUserForChat(req, res, next);

    expect(User.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.arrayContaining(["id", "role", "isOnline"]),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          users: expect.arrayContaining([
            expect.objectContaining({
              isOnline: true,
            }),
          ]),
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
