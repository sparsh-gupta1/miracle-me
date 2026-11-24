"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("chats", "service_type", {
            type: "enum_pricing_service_type",
            allowNull: true,
        });

        await queryInterface.addColumn("chats", "status", {
            type: Sequelize.ENUM("created", "started", "ended"),
            allowNull: false,
            defaultValue: "created",
        });

        await queryInterface.addColumn("chats", "started_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await queryInterface.addColumn("chats", "ended_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await queryInterface.addColumn("chats", "duration_seconds", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("chats", "duration_seconds");
        await queryInterface.removeColumn("chats", "ended_at");
        await queryInterface.removeColumn("chats", "started_at");
        await queryInterface.removeColumn("chats", "status");
        await queryInterface.removeColumn("chats", "service_type");
    },
};
