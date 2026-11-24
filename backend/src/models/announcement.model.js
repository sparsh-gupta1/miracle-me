const { Model, DataTypes } = require("sequelize");

class Announcement extends Model {
    static initialize(sequelize) {
        Announcement.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                message: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                    validate: {
                        notEmpty: true,
                    },
                },
                isActive: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                },
                targetRoles: {
                    type: DataTypes.ARRAY(DataTypes.TEXT),
                    allowNull: false,
                    defaultValue: ["user", "listener", "astrologer"],
                },
                createdBy: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
            },
            {
                sequelize,
                modelName: "Announcement",
                tableName: "announcements",
                timestamps: true,
                underscored: true,
                paranoid: true,
                indexes: [
                    {
                        fields: ["is_active", "created_at"],
                        name: "announcements_active_created",
                    },
                ],
            }
        );
    }

    static associate(models) {
        Announcement.belongsTo(models.User, {
            foreignKey: "createdBy",
            as: "creator",
        });
    }
}

module.exports = Announcement;
