const { Model, DataTypes } = require("sequelize");

class IntroVideoView extends Model {
  static initialize(sequelize) {
    IntroVideoView.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        // Which intro video this view record belongs to
        introVideoId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "intro_video_id",
          references: {
            model: "intro_videos",
            key: "id",
          },
        },
        // Which user viewed (or hasn't yet)
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "user_id",
          references: {
            model: "users",
            key: "id",
          },
        },
        // Has the user watched it?
        isViewed: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          field: "is_viewed",
        },
        // Timestamp when the user first marked it as viewed
        viewedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "viewed_at",
        },
      },
      {
        sequelize,
        modelName: "IntroVideoView",
        tableName: "intro_video_views",
        timestamps: true,
        underscored: true,
        indexes: [
          {
            // Each user can have only one view record per video
            unique: true,
            fields: ["intro_video_id", "user_id"],
            name: "intro_video_views_unique_user_video",
          },
          {
            fields: ["user_id"],
            name: "intro_video_views_user_id",
          },
        ],
      }
    );
  }

  static associate(models) {
    IntroVideoView.belongsTo(models.IntroVideo, {
      foreignKey: "introVideoId",
      as: "introVideo",
    });

    IntroVideoView.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });
  }
}

module.exports = IntroVideoView;
