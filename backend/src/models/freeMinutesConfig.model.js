const { Model, DataTypes } = require("sequelize");

class FreeMinutesConfig extends Model {
    static initialize(sequelize) {
        FreeMinutesConfig.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                service_type: {
                    type: "enum_pricing_service_type",
                    allowNull: false,
                    unique: true,
                },
                free_minutes: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    defaultValue: 0,
                },
                is_active: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                },
                created_by: {
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
                modelName: "FreeMinutesConfig",
                tableName: "free_minutes_config",
                timestamps: true,
                underscored: true,
            }
        );
    }

    static associate(models) {
        FreeMinutesConfig.belongsTo(models.User, {
            foreignKey: "created_by",
            as: "creator",
        });
    }
}

module.exports = FreeMinutesConfig;
