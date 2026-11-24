"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("chat_participants", {
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
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      isActiveInChat: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      lastReadMessageId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "messages",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      joinedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
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

    await queryInterface.addIndex("chat_participants", {
      name: "unique_chat_user",
      unique: true,
      fields: ["chatId", "userId"],
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("chat_participants", "unique_chat_user");
    await queryInterface.dropTable("chat_participants");
  },
};
