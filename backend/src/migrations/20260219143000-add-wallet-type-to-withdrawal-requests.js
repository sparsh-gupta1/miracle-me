"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("withdrawal_requests", "wallet_type", {
            type: Sequelize.ENUM("main", "earning"),
            defaultValue: "earning",
            allowNull: false,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("withdrawal_requests", "wallet_type");
        // Note: We might want to drop the enum type if it was created specifically for this column,
        // but usually, it's shared with the 'wallets' table 'type' column.
    },
};
