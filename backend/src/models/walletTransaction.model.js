const { Model, DataTypes } = require("sequelize");

class WalletTransaction extends Model {
    static initialize(sequelize) {
        WalletTransaction.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                walletId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "wallet_id",
                    references: {
                        model: "wallets",
                        key: "id",
                    },
                },
                type: {
                    type: DataTypes.ENUM("credit", "debit"),
                    allowNull: false,
                },
                amount: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    validate: {
                        min: 0.01,
                    },
                },
                balanceBefore: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    field: "balance_before",
                },
                balanceAfter: {
                    type: DataTypes.DECIMAL(15, 2),
                    allowNull: false,
                    field: "balance_after",
                },
                referenceType: {
                    type: DataTypes.ENUM("conversation", "withdrawal", "recharge", "commission", "refund", "response_penalty"),
                    allowNull: false,
                    field: "reference_type",
                },
                referenceId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    field: "reference_id",
                },
                description: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                metadata: {
                    type: DataTypes.JSONB,
                    defaultValue: {},
                },
            },
            {
                sequelize,
                modelName: "WalletTransaction",
                tableName: "wallet_transactions",
                timestamps: true,
                underscored: true,
                updatedAt: false, // Immutable records
                indexes: [
                    {
                        fields: ["wallet_id", "created_at"],
                        name: "wallet_transactions_wallet_created",
                    },
                    {
                        fields: ["reference_type", "reference_id"],
                        name: "wallet_transactions_reference",
                    },
                    {
                        unique: false,
                        fields: ["wallet_id", "reference_type", "reference_id"],
                        name: "idx_wallet_reference",
                    },
                ],
            }
        );
    }

    static associate(models) {
        WalletTransaction.belongsTo(models.Wallet, {
            foreignKey: "walletId",
            as: "wallet",
        });
        WalletTransaction.hasOne(models.Ledger, {
            foreignKey: "walletTransactionId",
            as: "ledgerEntry",
        });
        WalletTransaction.hasOne(models.CommunicationCharge, {
            foreignKey: "walletTransactionId",
            as: "charge",
        });
    }
}

module.exports = WalletTransaction;
