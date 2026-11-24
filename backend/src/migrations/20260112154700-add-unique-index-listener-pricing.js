"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addIndex("listener_global_pricing",
            ["service_type", "effective_from", "price_per_minute"],
            {
                unique: true,
                name: "unique_service_date_price",
            }
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex(
            "listener_global_pricing",
            "unique_service_date_price"
        );
    },
};
