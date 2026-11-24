const { Model, DataTypes } = require("sequelize");

class ListenerCustomPricing extends Model {
    static initialize(sequelize) {
        ListenerCustomPricing.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                listenerId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "listener_id",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                serviceType: {
                    // Reuse the shared PostgreSQL enum type
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
                modelName: "ListenerCustomPricing",
                tableName: "listener_custom_pricing",
                timestamps: true,
                createdAt: "created_at",
                updatedAt: "updated_at",
                indexes: [
                    {
                        unique: true,
                        fields: ["listener_id", "service_type"],
                        name: "unique_listener_service_pricing",
                    },
                ],
            }
        );
    }

    static associate(models) {
        ListenerCustomPricing.belongsTo(models.User, {
            foreignKey: "listenerId",
            as: "listener",
        });
    }
}

module.exports = ListenerCustomPricing;
