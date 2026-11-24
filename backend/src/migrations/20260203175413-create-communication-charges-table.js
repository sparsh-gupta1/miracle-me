"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("communication_charges", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            conversationId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "chats",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
                field: "conversation_id",
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
            serviceType: {
                type: "enum_pricing_service_type",
                allowNull: false,
                field: "service_type",
            },
            durationSeconds: {
                type: Sequelize.INTEGER,
                allowNull: false,
                field: "duration_seconds",
            },
            pricePerMinute: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
                field: "price_per_minute",
            },
            ratePerSecond: {
                type: Sequelize.DECIMAL(20, 6),
                allowNull: false,
                field: "rate_per_second",
            },
            grossAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                field: "gross_amount",
            },
            commissionPercentage: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                field: "commission_percentage",
            },
            commissionAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                field: "commission_amount",
            },
            netEarning: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                field: "net_earning",
            },
            pricingSource: {
                type: Sequelize.STRING,
                allowNull: false,
                field: "pricing_source",
            },
            pricingId: {
                type: Sequelize.UUID,
                allowNull: true,
                field: "pricing_id",
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
            chargedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
                field: "charged_at",
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

        await queryInterface.addIndex("communication_charges", ["conversation_id"], {
            name: "communication_charges_conversation",
        });

        await queryInterface.addIndex("communication_charges", ["user_id", "charged_at"], {
            name: "communication_charges_user_date",
        });

        await queryInterface.addIndex("communication_charges", ["conversation_id", "user_id"], {
            unique: true,
            name: "unique_conversation_user_charge",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("communication_charges");
    },
};
