"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Add 'astrologer' to the existing enum
        await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'astrologer';
    `);
    },

    down: async (queryInterface, Sequelize) => {
        // Note: PostgreSQL doesn't support removing enum values directly
        // This would require recreating the enum type
        console.log("Warning: Cannot remove enum value 'astrologer'. Manual intervention required.");
    },
};
