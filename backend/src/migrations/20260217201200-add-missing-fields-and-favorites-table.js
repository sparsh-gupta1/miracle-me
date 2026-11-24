module.exports = {
    async up(queryInterface, Sequelize) {
        // Add is_video_call_available to users
        await queryInterface.addColumn('users', 'is_video_call_available', {
            type: Sequelize.BOOLEAN,
            defaultValue: true,
            allowNull: false,
        });

        // Add is_deleted to messages
        await queryInterface.addColumn('messages', 'is_deleted', {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        });

        // Create user_favorites table
        await queryInterface.createTable('user_favorites', {
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
            favorite_user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
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

        // Add unique index to prevent duplicate favorites
        await queryInterface.addIndex('user_favorites', ['user_id', 'favorite_user_id'], {
            unique: true,
            name: 'unique_user_favorite',
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('users', 'is_video_call_available');
        await queryInterface.removeColumn('messages', 'is_deleted');
        await queryInterface.dropTable('user_favorites');
    },
};
