"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("announcements", "target_roles", {
            type: Sequelize.ARRAY(Sequelize.TEXT),
            allowNull: false,
            defaultValue: ["user", "listener", "astrologer"],
        });

        await queryInterface.addIndex("announcements", ["target_roles"], {
            name: "announcements_target_roles",
            using: "GIN",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeIndex(
            "announcements",
            "announcements_target_roles"
        );
        await queryInterface.removeColumn("announcements", "target_roles");
    },
};
