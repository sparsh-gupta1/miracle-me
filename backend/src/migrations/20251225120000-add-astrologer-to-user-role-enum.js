"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'astrologer' to the role ENUM in users table using raw SQL
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'astrologer';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type without the value
    // For simplicity, we'll leave the enum value in place
  },
};
