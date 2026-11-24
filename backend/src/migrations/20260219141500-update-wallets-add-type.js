"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // 1. Add the type column
        await queryInterface.addColumn("wallets", "type", {
            type: Sequelize.ENUM("main", "earning"),
            defaultValue: "main",
            allowNull: false,
        });

        // 2. Remove old unique index if it exists
        try {
            await queryInterface.removeIndex("wallets", "unique_user_wallet");
        } catch (e) {
            // Ignore if not found
        }

        // 3. Add new composite unique index
        await queryInterface.addIndex("wallets", ["user_id", "type"], {
            unique: true,
            name: "unique_user_wallet_type",
        });
    },

    down: async (queryInterface, Sequelize) => {
        // 1. Remove new index
        await queryInterface.removeIndex("wallets", "unique_user_wallet_type");

        // 2. Remove the enum column
        await queryInterface.removeColumn("wallets", "type");

        // 3. Restore old index
        await queryInterface.addIndex("wallets", ["user_id"], {
            unique: true,
            name: "unique_user_wallet",
        });
    },
};
