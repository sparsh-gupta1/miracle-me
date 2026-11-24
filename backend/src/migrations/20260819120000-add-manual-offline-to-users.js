"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "manual_offline", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query(
      `UPDATE users SET manual_offline = (NOT "isOnline") WHERE role IN ('listener', 'astrologer')`,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "manual_offline");
  },
};