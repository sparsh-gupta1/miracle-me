const { Model, DataTypes } = require("sequelize");

class ResponseWindow extends Model {
  static initialize(sequelize) {
    this.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          allowNull: false,
        },
        chatId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "chats",
            key: "id",
          },
          onDelete: "CASCADE",
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        listenerId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        startedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        warningAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        respondedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        penaltyAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        penaltySeconds: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        penaltyAmount: {
          type: DataTypes.DECIMAL(10, 4),
          allowNull: true,
        },
        warningSent: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        penaltyApplied: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        status: {
          type: DataTypes.ENUM(
            "waiting",
            "warning_sent",
            "penalized",
            "responded",
            "cancelled"
          ),
          allowNull: false,
          defaultValue: "waiting",
        },
      },
      {
        sequelize,
        modelName: "ResponseWindow",
        tableName: "response_windows",
        timestamps: true,
        indexes: [
          {
            fields: ["chatId"],
          },
          {
            fields: ["listenerId"],
          },
          {
            fields: ["status"],
          },
        ],
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.Chat, { foreignKey: "chatId", as: "chat" });
    this.belongsTo(models.User, { foreignKey: "userId", as: "user" });
    this.belongsTo(models.User, { foreignKey: "listenerId", as: "listener" });
  }
}

module.exports = ResponseWindow;
