"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            // PostgreSQL requires ALTER TYPE to add new values to an existing ENUM
            await queryInterface.sequelize.query(
                "ALTER TYPE \"enum_messages_messageType\" ADD VALUE IF NOT EXISTS 'voice';"
            );
            await queryInterface.sequelize.query(
                "ALTER TYPE \"enum_messages_messageType\" ADD VALUE IF NOT EXISTS 'video';"
            );
            console.log('Successfully added voice and video to enum_messages_messageType');
        } catch (error) {
            // If the values already exist, it will throw an error despite IF NOT EXISTS in some environments
            // but in standard Postgres 9.4+, IF NOT EXISTS handles it.
            console.error('Error updating ENUM:', error);
        }
    },

    async down(queryInterface, Sequelize) {
        // Note: Decreasing ENUM values is complex in Postgres and often not recommended
        // as it requires dropping dependecies or manually editing pg_enum.
        // Usually, we just leave the values there even if we stop using them in code.
        console.log('Down migration: Enum values cannot be easily removed. Skipping removal.');
    },
};
