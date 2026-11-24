const { Model, DataTypes } = require("sequelize");

class WithdrawalRule extends Model {
    static initialize(sequelize) {
        WithdrawalRule.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                minAmount: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    validate: {
                        min: 0,
                    },
                },
                allowedDays: {
                    type: DataTypes.JSONB,
                    allowNull: false,
                    defaultValue: [0, 1, 2, 3, 4, 5, 6], // All days allowed by default
                    comment: "Array of allowed day numbers (0=Sunday, 6=Saturday)",
                },
                effectiveFrom: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                createdBy: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                isActive: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                },
            },
            {
                sequelize,
                modelName: "WithdrawalRule",
                tableName: "withdrawal_rules",
                timestamps: true,
                underscored: true,
                indexes: [
                    {
                        fields: ["is_active", "effective_from"],
                        name: "withdrawal_rules_active_date",
                    },
                ],
            }
        );
    }

    static associate(models) {
        WithdrawalRule.belongsTo(models.User, {
            foreignKey: "createdBy",
            as: "creator",
        });
    }
}

module.exports = WithdrawalRule;
