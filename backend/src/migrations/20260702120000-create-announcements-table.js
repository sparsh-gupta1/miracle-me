"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable("announcements", {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            message: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                field: "is_active",
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
            deletedAt: {
                type: Sequelize.DATE,
                allowNull: true,
                field: "deleted_at",
            },
        });

        await queryInterface.addIndex("announcements", ["is_active", "created_at"], {
            name: "announcements_active_created",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable("announcements");
    },
};
