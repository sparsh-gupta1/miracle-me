const { Model, DataTypes } = require("sequelize");

class WithdrawalRequest extends Model {
    static initialize(sequelize) {
        WithdrawalRequest.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
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
                amount: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    validate: {
                        min: 0.01,
                    },
                },
                status: {
                    type: DataTypes.ENUM("pending", "approved", "rejected"),
                    allowNull: false,
                    defaultValue: "pending",
                },
                walletType: {
                    type: DataTypes.ENUM("main", "earning"),
                    allowNull: false,
                    defaultValue: "earning",
                    field: "wallet_type",
                },
                requestedAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                    field: "requested_at",
                },
                processedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    field: "processed_at",
                },
                processedBy: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    field: "processed_by",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                rejectionReason: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                    field: "rejection_reason",
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
                metadata: {
                    type: DataTypes.JSONB,
                    defaultValue: {},
                },
            },
            {
                sequelize,
                modelName: "WithdrawalRequest",
                tableName: "withdrawal_requests",
                timestamps: true,
                underscored: true,
                indexes: [
                    {
                        fields: ["user_id", "status"],
                        name: "withdrawal_requests_user_status",
                    },
                    {
                        fields: ["status", "requested_at"],
                        name: "withdrawal_requests_status_date",
                    },
                ],
            }
        );
    }

    static associate(models) {
        WithdrawalRequest.belongsTo(models.User, {
            foreignKey: "userId",
            as: "user",
        });
        WithdrawalRequest.belongsTo(models.User, {
            foreignKey: "processedBy",
            as: "processor",
        });
        WithdrawalRequest.belongsTo(models.WalletTransaction, {
            foreignKey: "walletTransactionId",
            as: "walletTransaction",
        });
    }
}

module.exports = WithdrawalRequest;
