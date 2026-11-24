"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'video' and 'voice' to the messageType ENUM
    await queryInterface.changeColumn("messages", "messageType", {
      type: Sequelize.ENUM("text", "image", "file", "video", "voice"),
      defaultValue: "text",
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert back to the original ENUM
    await queryInterface.changeColumn("messages", "messageType", {
      type: Sequelize.ENUM("text", "image", "file"),
      defaultValue: "text",
      allowNull: false,
    });
  },
};
