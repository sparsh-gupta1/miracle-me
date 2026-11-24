"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("astrologer_custom_pricing", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                allowNull: false,
                primaryKey: true,
            },
            astrologer_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: true, // Reserved for future user-specific pricing
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            service_type: {
                type: "enum_pricing_service_type",
                allowNull: false,
            },
            price_per_minute: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
        });

        // Unique constraint: one price per service per astrologer (when user_id is NULL)
        await queryInterface.addConstraint("astrologer_custom_pricing", {
            fields: ["astrologer_id", "service_type"],
            type: "unique",
            name: "unique_astrologer_service_pricing",
            where: {
                user_id: null,
            },
        });

        // Create indexes
        await queryInterface.addIndex("astrologer_custom_pricing", ["astrologer_id"]);
        await queryInterface.addIndex("astrologer_custom_pricing", ["service_type"]);
        await queryInterface.addIndex("astrologer_custom_pricing", ["is_active"]);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("astrologer_custom_pricing");
    },
};
