const { Model, DataTypes } = require("sequelize");

class UserMetadata extends Model {
  static initialize(sequelize) {
    UserMetadata.init(
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
        metadata: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: { betaAccess: false },
        },
      },
      {
        sequelize,
        modelName: "userMetadata",
        tableName: "user_metadata",
        timestamps: true,
      }
    );
  }

  static associate(models) {
    this.belongsTo(models.User, { foreignKey: "userId", as: "user" });
  }
}

module.exports = UserMetadata;
