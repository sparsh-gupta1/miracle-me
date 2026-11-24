"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("ledger", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            walletTransactionId: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,
                references: {
                    model: "wallet_transactions",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
                field: "wallet_transaction_id",
            },
            debitWalletId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: "wallets",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
                field: "debit_wallet_id",
            },
            creditWalletId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: "wallets",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
                field: "credit_wallet_id",
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
            },
            description: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            metadata: {
                type: Sequelize.JSONB,
                defaultValue: {},
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                field: "created_at",
            },
        });

        await queryInterface.addIndex("ledger", ["debit_wallet_id"], {
            name: "ledger_debit_wallet",
        });

        await queryInterface.addIndex("ledger", ["credit_wallet_id"], {
            name: "ledger_credit_wallet",
        });

        await queryInterface.addIndex("ledger", ["wallet_transaction_id"], {
            unique: true,
            name: "unique_ledger_transaction",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("ledger");
    },
};
