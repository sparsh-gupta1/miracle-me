const { Model, DataTypes } = require("sequelize");

class ListenerGlobalPricing extends Model {
    static initialize(sequelize) {
        ListenerGlobalPricing.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                serviceType: {
                    // Use the existing PostgreSQL enum type created by migration
                    type: "enum_pricing_service_type",
                    allowNull: false,
                    field: "service_type",
                },
                pricePerMinute: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                    field: "price_per_minute",
                },
                effectiveFrom: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                    field: "effective_from",
                },
                createdBy: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "created_by",
                    references: {
                        model: "users",
                        key: "id",
                    },
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
                modelName: "ListenerGlobalPricing",
                tableName: "listener_global_pricing",
                timestamps: true,
                indexes: [
                    {
                        unique: true,
                        fields: ["service_type", "effective_from", "price_per_minute"],
                        name: "unique_service_date_price",
                    },
                ],
            }
        );
    }

    static associate(models) {
        ListenerGlobalPricing.belongsTo(models.User, {
            foreignKey: "createdBy",
            as: "creator",
        });
    }
}

module.exports = ListenerGlobalPricing;
