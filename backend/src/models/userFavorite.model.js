const { Model, DataTypes } = require("sequelize");

class UserFavorite extends Model {
    static initialize(sequelize) {
        UserFavorite.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "user_id",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                favoriteUserId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    field: "favorite_user_id",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
            },
            {
                sequelize,
                modelName: "UserFavorite",
                tableName: "user_favorites",
                timestamps: true,
                underscored: true,
            }
        );
    }

    static associate(models) {
        UserFavorite.belongsTo(models.User, { foreignKey: "userId", as: "user" });
        UserFavorite.belongsTo(models.User, { foreignKey: "favoriteUserId", as: "favoriteUser" });
    }
}

module.exports = UserFavorite;
