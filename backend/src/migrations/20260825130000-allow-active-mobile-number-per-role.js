"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeIndex("users", "users_one_active_mobile");
    await queryInterface.addIndex("users", ["mobileNumber", "role"], {
      name: "users_one_active_mobile_per_role",
      unique: true,
      where: {
        isActive: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("users", "users_one_active_mobile_per_role");
    await queryInterface.addIndex("users", ["mobileNumber"], {
      name: "users_one_active_mobile",
      unique: true,
      where: {
        isActive: true,
      },
    });
  },
};
