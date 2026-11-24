"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("response_windows", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
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
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      listenerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      warningAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      respondedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      penaltyAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      penaltySeconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      penaltyAmount: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: true,
      },
      warningSent: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      penaltyApplied: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: Sequelize.ENUM(
          "waiting",
          "warning_sent",
          "penalized",
          "responded",
          "cancelled"
        ),
        allowNull: false,
        defaultValue: "waiting",
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("response_windows", ["chatId"]);
    await queryInterface.addIndex("response_windows", ["listenerId"]);
    await queryInterface.addIndex("response_windows", ["status"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("response_windows");
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_response_windows_status";'
    );
  },
};
