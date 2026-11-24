module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('user_free_minutes_usage', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            service_type: {
                type: 'enum_pricing_service_type',
                allowNull: false,
            },
            total_free_seconds: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Total free seconds allocated to user',
            },
            consumed_seconds: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Seconds consumed from free allocation',
            },
            remaining_seconds: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Remaining free seconds',
            },
            last_reset_at: {
                type: Sequelize.DATE,
                allowNull: true,
                comment: 'Last time free minutes were reset (if applicable)',
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW,
            },
        });

        // Unique constraint: one record per user per service type
        await queryInterface.addIndex('user_free_minutes_usage', ['user_id', 'service_type'], {
            unique: true,
            name: 'unique_user_service_type',
        });

        // Index for faster lookups
        await queryInterface.addIndex('user_free_minutes_usage', ['user_id'], {
            name: 'idx_user_free_minutes_user_id',
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('user_free_minutes_usage');
    },
};
