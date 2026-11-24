"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("withdrawal_requests", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            userId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
                field: "user_id",
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
            },
            status: {
                type: Sequelize.ENUM("pending", "approved", "rejected"),
                allowNull: false,
                defaultValue: "pending",
            },
            requestedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
                field: "requested_at",
            },
            processedAt: {
                type: Sequelize.DATE,
                allowNull: true,
                field: "processed_at",
            },
            processedBy: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
                field: "processed_by",
            },
            rejectionReason: {
                type: Sequelize.TEXT,
                allowNull: true,
                field: "rejection_reason",
            },
            walletTransactionId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: "wallet_transactions",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
                field: "wallet_transaction_id",
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
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                field: "updated_at",
            },
        });

        await queryInterface.addIndex("withdrawal_requests", ["user_id", "status"], {
            name: "withdrawal_requests_user_status",
        });

        await queryInterface.addIndex("withdrawal_requests", ["status", "requested_at"], {
            name: "withdrawal_requests_status_date",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("withdrawal_requests");
    },
};
