"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("wallet_transactions", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            walletId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "wallets",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
                field: "wallet_id",
            },
            type: {
                type: Sequelize.ENUM("credit", "debit"),
                allowNull: false,
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
            },
            balanceBefore: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                field: "balance_before",
            },
            balanceAfter: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                field: "balance_after",
            },
            referenceType: {
                type: Sequelize.ENUM("conversation", "withdrawal", "recharge", "commission", "refund"),
                allowNull: false,
                field: "reference_type",
            },
            referenceId: {
                type: Sequelize.UUID,
                allowNull: true,
                field: "reference_id",
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

        await queryInterface.addIndex("wallet_transactions", ["wallet_id", "created_at"], {
            name: "wallet_transactions_wallet_created",
        });

        await queryInterface.addIndex("wallet_transactions", ["reference_type", "reference_id"], {
            name: "wallet_transactions_reference",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("wallet_transactions");
    },
};
