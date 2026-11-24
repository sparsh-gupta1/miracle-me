const { Model, DataTypes } = require("sequelize");

class AstrologerCustomPricing extends Model {
    static initialize(sequelize) {
        AstrologerCustomPricing.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                astrologerId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "astrologer_id",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: true, // Reserved for future user-specific pricing
                    field: "user_id",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                serviceType: {
                    // Use the shared PostgreSQL enum type created by migration
                    type: "enum_pricing_service_type",
                    allowNull: false,
                    field: "service_type",
                },
                pricePerMinute: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                    field: "price_per_minute",
                },
                isActive: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                    field: "is_active",
                },
            },
            {
                sequelize,
                modelName: "AstrologerCustomPricing",
                tableName: "astrologer_custom_pricing",
                timestamps: true,
                indexes: [
                    {
                        unique: true,
                        fields: ["astrologer_id", "service_type"],
                        where: {
                            user_id: null,
                        },
                        name: "unique_astrologer_service_pricing",
                    },
                ],
            }
        );
    }

    static associate(models) {
        AstrologerCustomPricing.belongsTo(models.User, {
            foreignKey: "astrologerId",
            as: "astrologer",
        });
        AstrologerCustomPricing.belongsTo(models.User, {
            foreignKey: "userId",
            as: "user",
        });
    }
}

module.exports = AstrologerCustomPricing;
