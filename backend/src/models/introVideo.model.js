const { Model, DataTypes } = require("sequelize");

class IntroVideo extends Model {
  static initialize(sequelize) {
    IntroVideo.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        // Display title for the intro video
        title: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "title",
        },
        // Optional description / subtitle
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
          field: "description",
        },
        // S3 object key (used to generate presigned URLs)
        s3Key: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "s3_key",
        },
        // Public or presigned S3 URL at the time of upload
        s3Url: {
          type: DataTypes.STRING,
          allowNull: false,
          field: "s3_url",
        },
        // MIME type e.g. video/mp4, application/pdf
        mimeType: {
          type: DataTypes.STRING,
          allowNull: true,
          field: "mime_type",
        },
        // File size in bytes
        fileSize: {
          type: DataTypes.BIGINT,
          allowNull: true,
          field: "file_size",
        },
        // Only one video is active at a time
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          field: "is_active",
        },
        // Admin who uploaded this video
        uploadedBy: {
          type: DataTypes.UUID,
          allowNull: false,
          field: "uploaded_by",
          references: {
            model: "users",
            key: "id",
          },
        },
      },
      {
        sequelize,
        modelName: "IntroVideo",
        tableName: "intro_videos",
        timestamps: true,
        underscored: true,
        paranoid: true,
        indexes: [
          {
            fields: ["is_active", "created_at"],
            name: "intro_videos_active_created",
          },
        ],
      }
    );
  }

  static associate(models) {
    IntroVideo.belongsTo(models.User, {
      foreignKey: "uploadedBy",
      as: "uploader",
    });

    IntroVideo.hasMany(models.IntroVideoView, {
      foreignKey: "introVideoId",
      as: "views",
    });
  }
}

module.exports = IntroVideo;
