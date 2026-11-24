const { DataTypes, Model } = require("sequelize");

class Chat extends Model {
  static initialize(sequelize) {
    Chat.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        participant1Id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        participant2Id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        serviceType: {
          type: "enum_pricing_service_type",
          allowNull: true,
          field: "service_type",
          comment: "Type of conversation: chat, audio_call, video_call",
        },
        status: {
          type: DataTypes.ENUM("created", "started", "ended"),
          allowNull: false,
          defaultValue: "created",
        },
        endReason: {
          type: DataTypes.STRING(40),
          allowNull: true,
          field: "end_reason",
          validate: {
            isIn: [["manual", "disconnect", "inactivity", "no_response", "balance_exhausted", "call_duration_limit", "admin", "system"]],
          },
        },
        endedByUserId: {
          type: DataTypes.UUID,
          allowNull: true,
          field: "ended_by_user_id",
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        endTriggerSource: {
          type: DataTypes.STRING(120),
          allowNull: true,
          field: "end_trigger_source",
        },
        startedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "started_at",
        },
        connectedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "connected_at",
          comment: "When both sides connected (call joined or first chat reply from the earner); billing starts here",
        },
        endedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "ended_at",
        },
        durationSeconds: {
          type: DataTypes.INTEGER,
          allowNull: true,
          field: "duration_seconds",
          comment: "Calculated duration in seconds",
        },
        lastMessageAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        timestamps: true,
        tableName: "chats",
        indexes: [
          {
            unique: true,
            fields: ["participant1Id", "participant2Id"],
            name: "unique_chat_participants",
          },
        ],
      }
    );
  }

  static associate(models) {
    Chat.belongsTo(models.User, {
      foreignKey: "participant1Id",
      as: "participant1",
    });
    Chat.belongsTo(models.User, {
      foreignKey: "participant2Id",
      as: "participant2",
    });
    Chat.hasMany(models.Message, { foreignKey: "chatId", as: "messages" });
    Chat.hasOne(models.ChatSetting, {
      foreignKey: "chatId",
      as: "chatSettings",
    });
    Chat.hasMany(models.CommunicationCharge, {
      foreignKey: "conversationId",
      as: "communicationCharges",
    });
  }
}

module.exports = Chat;
