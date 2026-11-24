const { CallRequest } = require("../models");

class ActivityService {
  async getActivityByUserId(userId, page, limit) {
    const offset = (page - 1) * limit;
    const activity = await CallRequest.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      attributes: ["id", "receiverId", "createdAt"],
      limit,
      offset,
      include: [
        {
          model: User,
          as: "receiver",
          attributes: ["id", "name"],
        },
      ],
    });
    return {
      activity,
      totalCount: chats.count,
      hasMore: offset + limit < chats.count,
    };
  }
}

module.exports = new ActivityService();
