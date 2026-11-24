// src/models/user.model.js - Updated User model with roles and mobile authentication
const { Model, DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");

class User extends Model {
  static initialize(sequelize) {
    User.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        mobileNumber: {
          type: DataTypes.STRING,
          allowNull: true,
          validate: {
            // Validate mobile number format - adjust this regex for your region's format
            is: /^[0-9]{10,15}$/,
          },
        },
        // Optional for Admin or Listener roles
        email: {
          type: DataTypes.STRING,
          allowNull: true,
          unique: true,
          validate: {
            isEmail: true,
          },
        },
        googleId: {
          type: DataTypes.STRING,
          allowNull: true,
          unique: true,
        },
        // Optional password for Admin
        password: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        // User's display name (optional for regular users)
        name: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        // Age (set by admin for listener/astrologer)
        age: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        // Languages spoken (set by admin for listener/astrologer)
        language: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: true,
          defaultValue: [],
        },
        // User role: 'user', 'listener', 'admin', 'astrologer'
        role: {
          type: DataTypes.ENUM("user", "listener", "admin", "astrologer"),
          defaultValue: "user",
          allowNull: false,
        },
        // Listener rating
        rating: {
          type: DataTypes.FLOAT,
          allowNull: true,
          defaultValue: 0,
        },
        // For storing OTP during verification
        otp: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        // When OTP expires
        otpExpiry: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        // Whether user is verified
        isVerified: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        // Whether user is active
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
        // Whether user is available for video calls
        isVideoCallAvailable: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          field: "is_video_call_available",
        },
        // Profile image URL
        profileImage: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        // Additional profile information (JSON format)
        profile: {
          type: DataTypes.JSONB,
          defaultValue: {},
        },

        // FCM registration token — Android push & standard iOS chat notifications
        fcmToken: {
          type: DataTypes.STRING,
          allowNull: true,
          field: "fcm_token",
        },

        // Apple PushKit VoIP token — REQUIRED to ring a killed iOS app
        voipToken: {
          type: DataTypes.STRING,
          allowNull: true,
          field: "voip_token",
        },

        // 'android' | 'ios' — determines which push channel the server uses
        platform: {
          type: DataTypes.ENUM("android", "ios"),
          allowNull: true,
          field: "platform",
        },
        isOnline: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        manualOffline: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          field: "manual_offline",
        },
        isBusy: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        // Listener "do not disturb". Independent of isBusy so a session ending can't clear it.
        isManualBusy: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false,
          field: "is_manual_busy",
        },
        // Embedded in every JWT as "tv"; incrementing it revokes all existing tokens (admin force logout).
        tokenVersion: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
          allowNull: false,
          field: "token_version",
        },
        lastSeen: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
        },
        // Last login timestamp
        lastLogin: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        deletedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      {
        sequelize,
        modelName: "User",
        tableName: "users",
        timestamps: true,
        paranoid: true,
        deletedAt: "deletedAt",
        hooks: {
          beforeCreate: async (user) => {
            // Only hash password if it exists (admin users)
            if (user.password) {
              user.password = await bcrypt.hash(user.password, 10);
            }

            // Generate OTP if it doesn't exist and user is not verified
            if (!user.isVerified && !user.otp) {
              user.otp = Math.floor(1000 + Math.random() * 9000).toString();
              user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
            }
          },
          beforeUpdate: async (user) => {
            if (user.changed("password") && user.password) {
              user.password = await bcrypt.hash(user.password, 10);
            }
          },
        },
      },
    );
  }

  static associate(models) {
    User.hasMany(models.Message, {
      foreignKey: "receiverId",
      as: "receivedMessages",
    });
    // User.hasMany(models.Chat, {
    //   foreignKey: "senderId",
    //   as: "sentMessages",
    // });
    // User.hasMany(models.Chat, {
    //   foreignKey: "participant1Id",
    //   as: "participant1",
    // });
    User.hasMany(models.ChatParticipant, {
      foreignKey: "userId",
      as: "chatParticipants",
    });
    User.hasOne(models.UserMetadata, {
      foreignKey: "userId",
      as: "userMetadata",
    });

    User.hasMany(models.ChatSetting, {
      foreignKey: "userId",
      as: "chatSettings",
    });

    // block list table

    User.hasMany(models.UserBlockList, {
      foreignKey: "userId",
      as: "userBlockLists",
    });

    User.hasMany(models.UserBlockList, {
      foreignKey: "blockedUserId",
      as: "blockedByUsers",
    });
    User.hasMany(models.UserFavorite, {
      foreignKey: "userId",
      as: "favorites",
    });
    User.hasMany(models.UserFavorite, {
      foreignKey: "favoriteUserId",
      as: "favoritedBy",
    });
    User.hasOne(models.Wallet, {
      foreignKey: "userId",
      as: "wallet",
    });
  }

  // Instance method to check password (for admin users)
  async comparePassword(password) {
    // If no password set, return false
    if (!this.password) return false;
    return bcrypt.compare(password, this.password);
  }

  // Method to verify OTP
  isValidOTP(otp) {
    return this.otp === otp && this.otpExpiry > new Date();
  }

  // Remove sensitive data when converting to JSON
  toJSON() {
    const values = { ...this.get() };
    delete values.password;
    delete values.otp;
    delete values.otpExpiry;
    delete values.tokenVersion;
    return values;
  }
}

module.exports = User;
