"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("chats", "end_reason", {
      type: Sequelize.STRING(40),
      allowNull: true,
    });

    await queryInterface.addColumn("chats", "ended_by_user_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addColumn("chats", "end_trigger_source", {
      type: Sequelize.STRING(120),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("chats", "end_trigger_source");
    await queryInterface.removeColumn("chats", "ended_by_user_id");
    await queryInterface.removeColumn("chats", "end_reason");
  },
};
