const { Model, DataTypes } = require("sequelize");

class Transaction extends Model {
    static initialize(sequelize) {
        Transaction.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                amount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                },
                currency: {
                    type: DataTypes.STRING,
                    defaultValue: "INR",
                    allowNull: false,
                },
                status: {
                    type: DataTypes.ENUM("pending", "completed", "failed", "refunded"),
                    defaultValue: "pending",
                    allowNull: false,
                },
                provider: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: "razorpay",
                },
                providerOrderId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                providerPaymentId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                providerSignature: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                description: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                metadata: {
                    type: DataTypes.JSONB,
                    defaultValue: {},
                },
            },
            {
                sequelize,
                modelName: "Transaction",
                tableName: "transactions",
                timestamps: true,
            }
        );
    }

    static associate(models) {
        Transaction.belongsTo(models.User, {
            foreignKey: "userId",
            as: "user",
        });
    }
}

module.exports = Transaction;
