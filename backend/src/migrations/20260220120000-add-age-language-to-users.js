"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("users", "age", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
        await queryInterface.addColumn("users", "language", {
            type: Sequelize.ARRAY(Sequelize.STRING),
            allowNull: true,
            defaultValue: [],
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("users", "age");
        await queryInterface.removeColumn("users", "language");
    },
};
