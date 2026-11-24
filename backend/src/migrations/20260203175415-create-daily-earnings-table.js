"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("daily_earnings", {
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
            date: {
                type: Sequelize.DATEONLY,
                allowNull: false,
            },
            totalGross: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0.00,
                field: "total_gross",
            },
            totalCommission: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0.00,
                field: "total_commission",
            },
            totalNet: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0.00,
                field: "total_net",
            },
            conversationCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                field: "conversation_count",
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

        await queryInterface.addIndex("daily_earnings", ["user_id", "date"], {
            unique: true,
            name: "unique_user_date_earnings",
        });

        await queryInterface.addIndex("daily_earnings", ["date"], {
            name: "daily_earnings_date",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("daily_earnings");
    },
};
