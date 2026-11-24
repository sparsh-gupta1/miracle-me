"use strict";
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid"); // Sequelize usually provides this

module.exports = {
    async up(queryInterface, Sequelize) {
        const hashedPassword = await bcrypt.hash("testuser@123", 10);

        // Check if admin already exists to prevent duplicates
        const existingAdmin = await queryInterface.rawSelect(
            "users",
            {
                where: {
                    email: "testuser@miracleme.com",
                },
            },
            ["id"]
        );

        if (!existingAdmin) {
            await queryInterface.bulkInsert("users", [
                {
                    id: uuidv4(),
                    name: "testuser",
                    email: "testuser@miracleme.com",
                    mobileNumber: "9999999992", // Dummy mobile for admin
                    password: hashedPassword,
                    role: "user",
                    isVerified: true,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("users", { email: "testuser@miracleme.com" }, {});
    },
};
