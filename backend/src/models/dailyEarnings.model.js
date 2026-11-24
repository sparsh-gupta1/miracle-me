const { Model, DataTypes } = require("sequelize");

class DailyEarnings extends Model {
    static initialize(sequelize) {
        DailyEarnings.init(
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
                date: {
                    type: DataTypes.DATEONLY,
                    allowNull: false,
                },
                totalGross: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    defaultValue: 0.00,
                },
                totalCommission: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    defaultValue: 0.00,
                },
                totalNet: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    defaultValue: 0.00,
                },
                conversationCount: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                totalDuration: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                    field: "total_duration",
                },
                totalPenalty: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    defaultValue: 0.00,
                    field: "total_penalty",
                },
                metadata: {
                    type: DataTypes.JSONB,
                    defaultValue: {},
                },
            },
            {
                sequelize,
                modelName: "DailyEarnings",
                tableName: "daily_earnings",
                timestamps: true,
                underscored: true,
                indexes: [
                    {
                        unique: true,
                        fields: ["user_id", "date"],
                        name: "unique_user_date_earnings",
                    },
                    {
                        fields: ["date"],
                        name: "daily_earnings_date",
                    },
                ],
            }
        );
    }

    static associate(models) {
        DailyEarnings.belongsTo(models.User, {
            foreignKey: "userId",
            as: "user",
        });
    }
}

module.exports = DailyEarnings;
