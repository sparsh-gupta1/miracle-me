"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("messages", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      chatId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "chats",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      senderId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      receiverId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      messageType: {
        type: Sequelize.ENUM("text", "image", "file"),
        defaultValue: "text",
      },
      isDelivered: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      isRead: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      readAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // Add indexes
    await queryInterface.addIndex("messages", ["chatId", "createdAt"]);
    await queryInterface.addIndex("messages", ["senderId"]);
    await queryInterface.addIndex("messages", ["receiverId"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("messages", ["chatId", "createdAt"]);
    await queryInterface.removeIndex("messages", ["senderId"]);
    await queryInterface.removeIndex("messages", ["receiverId"]);
    await queryInterface.dropTable("messages");
  },
};
