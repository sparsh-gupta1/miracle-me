"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        // Ensure the shared enum type exists (created by the global pricing migration)
        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_pricing_service_type') THEN
                    CREATE TYPE "enum_pricing_service_type" AS ENUM ('chat', 'audio_call', 'video_call');
                END IF;
            END $$;
        `);

        await queryInterface.createTable("listener_custom_pricing", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            listener_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            service_type: {
                type: Sequelize.ENUM("chat", "audio_call", "video_call"),
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
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
            },
        });

        // Unique constraint: one price per listener per service type
        await queryInterface.addIndex("listener_custom_pricing", {
            fields: ["listener_id", "service_type"],
            unique: true,
            name: "unique_listener_service_pricing",
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("listener_custom_pricing");
    },
};
