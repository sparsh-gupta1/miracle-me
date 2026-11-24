"use strict";

/**
 * Migration: Fix wallets unique constraint
 *
 * Problem: The wallets table had a unique index on (user_id) alone,
 * which prevented a user from having both a 'main' and an 'earning' wallet.
 *
 * Fix: Drop any stale single-column unique constraints on user_id and
 * ensure the composite unique index on (user_id, type) exists.
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Use raw SQL to find and drop ALL unique constraints on the wallets table
        // that cover only user_id (handles any legacy constraint name).
        await queryInterface.sequelize.query(`
            DO $$
            DECLARE
                r RECORD;
            BEGIN
                -- Find all unique constraints on wallets.user_id (single-column)
                FOR r IN
                    SELECT tc.constraint_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_name = kcu.table_name
                    WHERE tc.table_name = 'wallets'
                        AND tc.constraint_type = 'UNIQUE'
                        AND kcu.column_name = 'user_id'
                        -- Only drop constraints that are SOLELY on user_id (not composite)
                        AND (
                            SELECT COUNT(*)
                            FROM information_schema.key_column_usage kcu2
                            WHERE kcu2.constraint_name = tc.constraint_name
                        ) = 1
                LOOP
                    EXECUTE 'ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
                END LOOP;
            END $$;
        `);

        // Also drop the composite index if it somehow got created incorrectly
        try {
            await queryInterface.removeIndex("wallets", "unique_user_wallet_type");
        } catch (e) {
            // Ignore — index may not exist
        }

        // Re-create the correct composite unique index: (user_id, type)
        await queryInterface.addIndex("wallets", ["user_id", "type"], {
            unique: true,
            name: "unique_user_wallet_type",
        });
    },

    down: async (queryInterface, Sequelize) => {
        // Remove composite index
        try {
            await queryInterface.removeIndex("wallets", "unique_user_wallet_type");
        } catch (e) {
            // Ignore
        }

        // Restore the old single-column unique index
        await queryInterface.addIndex("wallets", ["user_id"], {
            unique: true,
            name: "wallets_user_id_key",
        });
    },
};
