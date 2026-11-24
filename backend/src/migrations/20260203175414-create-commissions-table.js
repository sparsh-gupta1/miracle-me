"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("commissions", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            role: {
                type: Sequelize.ENUM("listener", "astrologer"),
                allowNull: false,
            },
            serviceType: {
                type: "enum_pricing_service_type",
                allowNull: false,
                field: "service_type",
            },
            commissionPercentage: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                field: "commission_percentage",
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

        await queryInterface.addIndex("commissions", ["role", "service_type", "effective_from"], {
            name: "commission_role_service_date",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("commissions");
    },
};
