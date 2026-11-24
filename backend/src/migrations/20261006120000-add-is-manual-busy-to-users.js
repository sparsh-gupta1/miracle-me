module.exports = {
    async up(queryInterface, Sequelize) {
        // A listener's "do not disturb" toggle. Kept apart from is_busy (which is also set while a
        // session is active) so ending or healing a session can never clear it.
        await queryInterface.addColumn('users', 'is_manual_busy', {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('users', 'is_manual_busy');
    },
};
