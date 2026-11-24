"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns already exist
    const table = await queryInterface.describeTable("users");
    
    if (!table.fcm_token) {
      await queryInterface.addColumn("users", "fcm_token", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!table.voip_token) {
      await queryInterface.addColumn("users", "voip_token", {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!table.platform) {
      await queryInterface.addColumn("users", "platform", {
        type: Sequelize.ENUM("android", "ios"),
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("users", "fcm_token");
    await queryInterface.removeColumn("users", "voip_token");
    await queryInterface.removeColumn("users", "platform");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_users_platform";',
    );
  },
};
