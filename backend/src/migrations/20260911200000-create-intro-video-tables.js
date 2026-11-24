"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create intro_videos table
    await queryInterface.createTable("intro_videos", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      s3_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      s3_url: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      mime_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      uploaded_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Index for quickly fetching active video
    await queryInterface.addIndex("intro_videos", ["is_active", "created_at"], {
      name: "intro_videos_active_created",
    });

    // 2. Create intro_video_views table
    await queryInterface.createTable("intro_video_views", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      intro_video_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "intro_videos",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      is_viewed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // Unique constraint: one view record per user per video
    await queryInterface.addIndex(
      "intro_video_views",
      ["intro_video_id", "user_id"],
      {
        unique: true,
        name: "intro_video_views_unique_user_video",
      }
    );

    // Index for looking up a user's view records
    await queryInterface.addIndex("intro_video_views", ["user_id"], {
      name: "intro_video_views_user_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("intro_video_views");
    await queryInterface.dropTable("intro_videos");
  },
};
