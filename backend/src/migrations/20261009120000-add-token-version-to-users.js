module.exports = {
    async up(queryInterface, Sequelize) {
        // Every JWT carries the user's token_version ("tv"). Bumping it revokes all of the
        // user's existing access and refresh tokens, which is how admins log a user out.
        await queryInterface.addColumn('users', 'token_version', {
            type: Sequelize.INTEGER,
            defaultValue: 0,
            allowNull: false,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('users', 'token_version');
    },
};
