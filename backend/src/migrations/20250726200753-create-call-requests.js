"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("call_requests", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      senderId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      receiverId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      requestType: {
        type: Sequelize.ENUM("chat", "video", "audio"),
        allowNull: false,
      },
      requestTimestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      status: {
        type: Sequelize.ENUM(
          "pending",
          "accepted",
          "rejected",
          "cancelled",
          "missed"
        ),
        allowNull: false,
        defaultValue: "pending",
      },
      acceptanceTimestamp: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      rejectionTimestamp: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancellationTimestamp: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      missedTimestamp: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      duractionToAccept: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop ENUM types explicitly before dropping the table (Postgres specific)
    await queryInterface.dropTable("call_requests");
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_call_requests_requestType;"
    );
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_call_requests_status;"
    );
  },
};
