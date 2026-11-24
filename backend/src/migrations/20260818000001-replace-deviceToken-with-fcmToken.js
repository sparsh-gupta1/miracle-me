"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const table = await queryInterface.describeTable("users");

      // If device_token column exists, migrate data and remove it
      if (table.device_token) {
        // First, migrate any existing device_token data to fcm_token if fcm_token is NULL
        await queryInterface.sequelize.query(`
          UPDATE users 
          SET fcm_token = device_token 
          WHERE fcm_token IS NULL AND device_token IS NOT NULL
        `);

        // Remove the old device_token column
        await queryInterface.removeColumn("users", "device_token");
        console.log(
          "✓ device_token column removed and data migrated to fcm_token",
        );
      } else {
        console.log("✓ device_token column does not exist, skipping migration");
      }
    } catch (error) {
      console.error("Migration error:", error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // Rollback: recreate device_token column with data from fcm_token
    const table = await queryInterface.describeTable("users");

    if (!table.device_token) {
      await queryInterface.addColumn("users", "device_token", {
        type: Sequelize.STRING,
        allowNull: true,
      });

      // Copy data back from fcm_token to device_token
      await queryInterface.sequelize.query(`
        UPDATE users 
        SET device_token = fcm_token 
        WHERE device_token IS NULL AND fcm_token IS NOT NULL
      `);

      console.log("✓ device_token column restored");
    }
  },
};
