const { DataTypes, Model } = require("sequelize");

class Message extends Model {
  static initialize(sequelize) {
    Message.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        chatId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "chats",
            key: "id",
          },
        },
        senderId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        receiverId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        messageType: {
          type: DataTypes.ENUM("text", "image", "file", "video", "voice"),
          defaultValue: "text",
        },
        isDelivered: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        isRead: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        readAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        isDeleted: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          field: "is_deleted",
        },
      },
      {
        sequelize,
        timestamps: true,
        tableName: "messages",
        indexes: [
          {
            fields: ["chatId", "createdAt"],
          },
          {
            fields: ["senderId"],
          },
          {
            fields: ["receiverId"],
          },
        ],
      }
    );
  }

  static associate(models) {
    Message.belongsTo(models.User, { foreignKey: "senderId", as: "sender" });
    Message.belongsTo(models.User, {
      foreignKey: "receiverId",
      as: "receiver",
    });
    Message.belongsTo(models.Chat, { foreignKey: "chatId", as: "chat" });
  }
}

module.exports = Message;
