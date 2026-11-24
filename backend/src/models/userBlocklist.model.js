const { Model, DataTypes } = require("sequelize");

class UserBlockList extends Model {
  static initialize(sequelize) {
    UserBlockList.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
        blockedUserId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "users",
            key: "id",
          },
        },
      },
      {
        sequelize,
        modelName: "userBlockList",
        tableName: "user_blocklist",
        timestamps: true,
      }
    );
  }
  static associate(models) {
    UserBlockList.belongsTo(models.User, { foreignKey: "userId" });
    UserBlockList.belongsTo(models.User, {
      foreignKey: "blockedUserId",
      as: "blockedUsers",
    });
  }
}

module.exports = UserBlockList;
