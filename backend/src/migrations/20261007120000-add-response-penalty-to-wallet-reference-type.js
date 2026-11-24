"use strict";

module.exports = {
  async up(queryInterface) {
    // PostgreSQL requires ALTER TYPE to add new values to an existing ENUM.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_wallet_transactions_reference_type" ADD VALUE IF NOT EXISTS 'response_penalty';`
    );
  },

  async down() {
    // Postgres cannot drop a single enum value; leave it in place.
  },
};
