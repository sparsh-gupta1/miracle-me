"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      // Primary Key: UUID type with default value
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Mobile number (unique) - adjust validations on the model level as needed
      mobileNumber: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      // Email (unique)
      email: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      // Google ID (unique)
      googleId: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },
      // Optional password for Admin users
      password: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // User's display name (optional)
      name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // User role: 'user', 'listener', 'admin'
      role: {
        type: Sequelize.ENUM("user", "listener", "admin"),
        allowNull: false,
        defaultValue: "user",
      },
      // OTP for verification
      otp: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // OTP expiry date
      otpExpiry: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      // Whether the user is verified
      isVerified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      // Whether the user is active
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      // Profile image URL
      profileImage: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // Additional profile information stored as JSONB
      profile: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      // Device token for push notifications
      deviceToken: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // Online status indicator
      isOnline: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Last seen timestamp (using current timestamp as default)
      lastSeen: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      // Last login timestamp
      lastLogin: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      // Standard Sequelize timestamps
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
  },

  async down(queryInterface, Sequelize) {
    // When dropping the table, drop the ENUM type if needed (Postgres specific)
    await queryInterface.dropTable("users");
  },
};
