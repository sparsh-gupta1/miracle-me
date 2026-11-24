"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Create shared service_type enum for pricing (used by both listener and astrologer pricing tables)
        await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_pricing_service_type" AS ENUM ('chat', 'audio_call', 'video_call');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

        await queryInterface.createTable("listener_global_pricing", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                allowNull: false,
                primaryKey: true,
            },
            service_type: {
                type: "enum_pricing_service_type",
                allowNull: false,
            },
            price_per_minute: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
            },
            effective_from: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
            },
            created_by: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
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

        // Create indexes for efficient querying
        await queryInterface.addIndex("listener_global_pricing", ["service_type"]);
        await queryInterface.addIndex("listener_global_pricing", ["effective_from"]);
        await queryInterface.addIndex("listener_global_pricing", ["is_active"]);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("listener_global_pricing");
        await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_pricing_service_type";
    `);
    },
};
