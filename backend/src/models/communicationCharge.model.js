const { Model, DataTypes } = require("sequelize");

class CommunicationCharge extends Model {
    static initialize(sequelize) {
        CommunicationCharge.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                conversationId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "conversation_id",
                    references: {
                        model: "chats",
                        key: "id",
                    },
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "user_id",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                serviceType: {
                    type: "enum_pricing_service_type",
                    allowNull: false,
                    field: "service_type",
                },
                durationSeconds: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    field: "duration_seconds",
                    validate: {
                        min: 0,
                    },
                },
                pricePerMinute: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                    field: "price_per_minute",
                },
                ratePerSecond: {
                    type: DataTypes.DECIMAL(20, 6),
                    allowNull: false,
                    field: "rate_per_second",
                },
                grossAmount: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    field: "gross_amount",
                },
                commissionPercentage: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: false,
                    field: "commission_percentage",
                },
                commissionAmount: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    field: "commission_amount",
                },
                netEarning: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    field: "net_earning",
                },
                pricingSource: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    field: "pricing_source",
                },
                pricingId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    field: "pricing_id",
                },
                walletTransactionId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    field: "wallet_transaction_id",
                    references: {
                        model: "wallet_transactions",
                        key: "id",
                    },
                },
                chargedAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                    field: "charged_at",
                },
                metadata: {
                    type: DataTypes.JSONB,
                    defaultValue: {},
                },
            },
            {
                sequelize,
                modelName: "CommunicationCharge",
                tableName: "communication_charges",
                timestamps: true,
                underscored: true,
                updatedAt: false, // Immutable records
                indexes: [
                    {
                        fields: ["conversation_id"],
                        name: "communication_charges_conversation",
                    },
                    {
                        fields: ["user_id", "charged_at"],
                        name: "communication_charges_user_date",
                    },
                    {
                        unique: false,
                        fields: ["conversation_id", "user_id"],
                        name: "idx_conversation_user_charge",
                    },
                ],
            }
        );
    }

    static associate(models) {
        CommunicationCharge.belongsTo(models.Chat, {
            foreignKey: "conversationId",
            as: "conversation",
        });
        CommunicationCharge.belongsTo(models.User, {
            foreignKey: "userId",
            as: "user",
        });
        CommunicationCharge.belongsTo(models.WalletTransaction, {
            foreignKey: "walletTransactionId",
            as: "walletTransaction",
        });
    }
}

module.exports = CommunicationCharge;
