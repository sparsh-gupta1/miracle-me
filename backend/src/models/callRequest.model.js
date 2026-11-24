const { DataTypes, Model } = require("sequelize");

class CallRequest extends Model {
  static initialize(sequelize) {
    CallRequest.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
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
        requestType: {
          type: DataTypes.ENUM("chat", "video", "audio"),
          allowNull: false,
        },
        requestTimestamp: {
          allowNull: false,
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
        },
        status: {
          type: DataTypes.ENUM(
            "pending",
            "accepted",
            "rejected",
            "cancelled",
            "missed",
            "ended"
          ),
          allowNull: false,
          defaultValue: "pending",
        },
        acceptanceTimestamp: {
          allowNull: true,
          type: DataTypes.DATE,
        },
        rejectionTimestamp: {
          allowNull: true,
          type: DataTypes.DATE,
        },
        cancellationTimestamp: {
          allowNull: true,
          type: DataTypes.DATE,
        },
        missedTimestamp: {
          allowNull: true,
          type: DataTypes.DATE,
        },
        duractionToAccept: {
          allowNull: true,
          type: DataTypes.INTEGER,
        },
      },
      {
        sequelize,
        modelName: "callRequest",
        tableName: "call_requests",
        timestamps: true,
      }
    );
  }

  //hooks
  // create hook for a calculate duractionToAccept
  // duration_to_accept_seconds = (acceptance_timestamp - request_timestamp)
  async calculateDuractionToAccept() {
    this.duractionToAccept = Math.floor(
      (Date.now() - this.requestTimestamp) / 1000
    );
    await this.save();
    return this.duractionToAccept;
  }

  //methods

  static associate(models) {
    this.belongsTo(models.User, { foreignKey: "senderId", as: "sender" });
    this.belongsTo(models.User, { foreignKey: "receiverId", as: "receiver" });
  }
}

module.exports = CallRequest;
