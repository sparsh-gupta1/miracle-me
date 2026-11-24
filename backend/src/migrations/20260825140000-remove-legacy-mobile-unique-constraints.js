"use strict";

module.exports = {
  async up(queryInterface) {
    const [constraints] = await queryInterface.sequelize.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'users'::regclass
        AND contype = 'u'
        AND conname LIKE '%mobile%'
    `);

    for (const { conname } of constraints) {
      const safeName = conname.replace(/"/g, '""');
      await queryInterface.sequelize.query(
        `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "${safeName}"`,
      );
    }

    const [indexes] = await queryInterface.sequelize.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'users'
        AND indexname <> 'users_one_active_mobile_per_role'
        AND indexdef LIKE '%("mobileNumber")%'
        AND indexdef LIKE 'CREATE UNIQUE INDEX%'
    `);

    for (const { indexname } of indexes) {
      await queryInterface.removeIndex("users", indexname);
    }
  },

  async down() {
    // Legacy global mobile-number uniqueness is intentionally not restored.
  },
};
