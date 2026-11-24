const { Model, DataTypes } = require("sequelize");

class ChatSetting extends Model {
  static initialize(sequelize) {
    ChatSetting.init(
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
        customNickname: {
          type: DataTypes.STRING,
          allowNull: true,
        },
      },
      {
        sequelize,
        modelName: "chatSetting",
        tableName: "chat_settings",
        timestamps: true,
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.Chat, { foreignKey: "chatId", as: "chat" });
    this.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  }
}

module.exports = ChatSetting;
