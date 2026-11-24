'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Hash the password
        const hashedPassword = await bcrypt.hash('Miracleme@2025', 10);

        // Create admin user
        await queryInterface.bulkInsert('users', [
            {
                id: uuidv4(),
                email: 'admin@miracleme.in',
                password: hashedPassword,
                name: 'admin',
                role: 'admin',
                isVerified: true,
                isActive: true,
                isOnline: false,
                profile: JSON.stringify({}),
                createdAt: new Date(),
                updatedAt: new Date(),
                lastSeen: new Date(),
            }
        ], {});

        console.log('Admin user created successfully!');
        console.log('Email: admin@miracleme.in');
        console.log('Password: Miracleme@2025');
    },

    async down(queryInterface, Sequelize) {
        // Remove the admin user
        await queryInterface.bulkDelete('users', {
            email: 'admin@miracleme.in'
        }, {});

        console.log('Admin user removed successfully!');
    }
};
