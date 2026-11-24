"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("withdrawal_rules", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            minAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                field: "min_amount",
            },
            allowedDays: {
                type: Sequelize.JSONB,
                allowNull: false,
                defaultValue: [0, 1, 2, 3, 4, 5, 6],
                field: "allowed_days",
            },
            effectiveFrom: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
                field: "effective_from",
            },
            createdBy: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
                field: "created_by",
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                field: "is_active",
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

        await queryInterface.addIndex("withdrawal_rules", ["is_active", "effective_from"], {
            name: "withdrawal_rules_active_date",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("withdrawal_rules");
    },
};
