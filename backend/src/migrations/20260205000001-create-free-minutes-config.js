module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('free_minutes_config', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            service_type: {
                type: 'enum_pricing_service_type',
                allowNull: false,
                unique: true,
            },
            free_minutes: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Number of free minutes for this service type',
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            created_by: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT',
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

        await queryInterface.addIndex('free_minutes_config', ['service_type'], {
            unique: true,
            name: 'unique_service_type_free_minutes',
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('free_minutes_config');
    },
};
