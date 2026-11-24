"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // PostgreSQL requires ALTER TYPE to add new values to an existing ENUM
      // The enum name is usually "enum_<tableName>_<columnName>"
      await queryInterface.sequelize.query(
        'ALTER TYPE "enum_call_requests_status" ADD VALUE IF NOT EXISTS \'ended\';'
      );
      console.log('Successfully added "ended" to enum_call_requests_status');
    } catch (error) {
      console.error('Error updating ENUM:', error);
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('Down migration: Enum values cannot be easily removed in Postgres. Skipping removal.');
  },
};
