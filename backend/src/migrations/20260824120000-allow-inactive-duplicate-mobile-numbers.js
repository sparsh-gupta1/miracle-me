"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_mobileNumber_key"',
    );
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "users_mobileNumber_key"',
    );

    await queryInterface.addIndex("users", ["mobileNumber"], {
      name: "users_one_active_mobile",
      unique: true,
      where: {
        isActive: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("users", "users_one_active_mobile");
    await queryInterface.addIndex("users", ["mobileNumber"], {
      name: "users_mobileNumber_key",
      unique: true,
    });
  },
};