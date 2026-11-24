const { DataTypes, Model } = require("sequelize");

class ChatParticipant extends Model {
  static initialize(sequelize) {
    ChatParticipant.init(
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
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        isActiveInChat: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        lastReadMessageId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "messages",
            key: "id",
          },
        },
        joinedAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        timestamps: true,
        tableName: "chat_participants",
        indexes: [
          {
            unique: true,
            fields: ["chatId", "userId"],
          },
        ],
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.Chat, { foreignKey: "chatId", as: "chat" });
    this.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  }
}

module.exports = ChatParticipant;
