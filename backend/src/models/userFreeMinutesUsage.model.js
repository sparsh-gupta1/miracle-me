const { Model, DataTypes } = require("sequelize");

class UserFreeMinutesUsage extends Model {
    static initialize(sequelize) {
        UserFreeMinutesUsage.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                user_id: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                service_type: {
                    type: "enum_pricing_service_type",
                    allowNull: false,
                },
                total_free_seconds: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                consumed_seconds: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                remaining_seconds: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                last_reset_at: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
            },
            {
                sequelize,
                modelName: "UserFreeMinutesUsage",
                tableName: "user_free_minutes_usage",
                timestamps: true,
                underscored: true,
                indexes: [
                    {
                        unique: true,
                        fields: ["user_id", "service_type"],
                        name: "unique_user_service_type",
                    },
                ],
            }
        );
    }

    static associate(models) {
        UserFreeMinutesUsage.belongsTo(models.User, {
            foreignKey: "user_id",
            as: "user",
        });
    }
}

module.exports = UserFreeMinutesUsage;
