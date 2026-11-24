const { Model, DataTypes } = require("sequelize");

class Ledger extends Model {
    static initialize(sequelize) {
        Ledger.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                walletTransactionId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    unique: true,
                    field: "wallet_transaction_id",
                    references: {
                        model: "wallet_transactions",
                        key: "id",
                    },
                },
                debitWalletId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    field: "debit_wallet_id",
                    references: {
                        model: "wallets",
                        key: "id",
                    },
                },
                creditWalletId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    field: "credit_wallet_id",
                    references: {
                        model: "wallets",
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
                modelName: "Ledger",
                tableName: "ledger",
                timestamps: true,
                underscored: true,
                updatedAt: false, // Immutable records
                indexes: [
                    {
                        fields: ["debit_wallet_id"],
                        name: "ledger_debit_wallet",
                    },
                    {
                        fields: ["credit_wallet_id"],
                        name: "ledger_credit_wallet",
                    },
                    {
                        unique: true,
                        fields: ["wallet_transaction_id"],
                        name: "unique_ledger_transaction",
                    },
                ],
            }
        );
    }

    static associate(models) {
        Ledger.belongsTo(models.WalletTransaction, {
            foreignKey: "walletTransactionId",
            as: "walletTransaction",
        });
        Ledger.belongsTo(models.Wallet, {
            foreignKey: "debitWalletId",
            as: "debitWallet",
        });
        Ledger.belongsTo(models.Wallet, {
            foreignKey: "creditWalletId",
            as: "creditWallet",
        });
    }
}

module.exports = Ledger;
