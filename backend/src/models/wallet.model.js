const { Model, DataTypes } = require("sequelize");


class Wallet extends Model {
  static initialize(sequelize) {
    Wallet.init(
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
        type: {
          type: DataTypes.ENUM("main", "earning"),
          defaultValue: "main",
          allowNull: false,
        },
        balance: {
          type: DataTypes.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0.00,
          validate: {
            min: 0,
          },
        },
        currency: {
          type: DataTypes.STRING,
          defaultValue: "INR",
          allowNull: false,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          allowNull: false,
          field: "is_active",
        },
        lastTransactionAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "last_transaction_at",
        },
      },
      {
        sequelize,
        modelName: "Wallet",
        tableName: "wallets",
        timestamps: true,
        underscored: true,
        indexes: [
          {
            unique: true,
            fields: ["user_id", "type"],
            name: "unique_user_wallet_type",
          },
        ],
      }
    );
  }

  static associate(models) {
    Wallet.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });
    Wallet.hasMany(models.WalletTransaction, {
      foreignKey: "walletId",
      as: "transactions",
    });
  }
}

module.exports = Wallet;
