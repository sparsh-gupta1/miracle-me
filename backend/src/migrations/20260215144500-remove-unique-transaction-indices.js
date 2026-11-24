"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // 1. Drop unique constraint from communication_charges
        try {
            await queryInterface.removeIndex("communication_charges", "unique_conversation_user_charge");
        } catch (e) {
            console.log("Unique index unique_conversation_user_charge not found, skipping.");
        }

        // Add non-unique index
        await queryInterface.addIndex("communication_charges", ["conversation_id", "user_id"], {
            unique: false,
            name: "idx_conversation_user_charge",
        });

        // 2. Drop unique constraint from wallet_transactions
        // Based on model: unique_wallet_reference on [walletId, referenceType, referenceId]
        try {
            await queryInterface.removeIndex("wallet_transactions", "unique_wallet_reference");
        } catch (e) {
            console.log("Unique index unique_wallet_reference not found, skipping.");
        }

        // Add non-unique index
        await queryInterface.addIndex("wallet_transactions", ["wallet_id", "reference_type", "reference_id"], {
            unique: false,
            name: "idx_wallet_reference",
        });
    },

    down: async (queryInterface, Sequelize) => {
        // Restore unique indices
        await queryInterface.removeIndex("communication_charges", "idx_conversation_user_charge");
        await queryInterface.addIndex("communication_charges", ["conversation_id", "user_id"], {
            unique: true,
            name: "unique_conversation_user_charge",
        });

        await queryInterface.removeIndex("wallet_transactions", "idx_wallet_reference");
        await queryInterface.addIndex("wallet_transactions", ["wallet_id", "reference_type", "reference_id"], {
            unique: true,
            name: "unique_wallet_reference",
        });
    },
};
