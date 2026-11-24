"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn("transactions", "provider", {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "cashfree",
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.changeColumn("transactions", "provider", {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "razorpay",
        });
    },
};