const { Model, DataTypes } = require("sequelize");

class Commission extends Model {
    static initialize(sequelize) {
        Commission.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                role: {
                    type: DataTypes.ENUM("listener", "astrologer"),
                    allowNull: false,
                },
                serviceType: {
                    type: "enum_pricing_service_type", // Reuse existing enum
                    allowNull: false,
                },
                commissionPercentage: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: false,
                    validate: {
                        min: 0,
                        max: 100,
                    },
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
                modelName: "Commission",
                tableName: "commissions",
                timestamps: true,
                underscored: true,
                indexes: [
                    {
                        fields: ["role", "service_type", "effective_from"],
                        name: "commission_role_service_date",
                    },
                ],
            }
        );
    }

    static associate(models) {
        Commission.belongsTo(models.User, {
            foreignKey: "createdBy",
            as: "creator",
        });
    }
}

module.exports = Commission;
