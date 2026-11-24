const { Model, DataTypes } = require("sequelize");
const { encrypt, decrypt } = require("../utils/encryption");

class BankInfo extends Model {
    static initialize(sequelize) {
        BankInfo.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    unique: true, // One bank account per user
                    field: "user_id",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
                accountHolderName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    field: "account_holder_name",
                },
                accountNumber: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    field: "account_number",
                    // Decrypt when reading
                    get() {
                        const rawValue = this.getDataValue('accountNumber');
                        if (rawValue) {
                            try {
                                return decrypt(rawValue);
                            } catch (e) {
                                return null;
                            }
                        }
                        return rawValue;
                    }
                },
                ifscCode: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    field: "ifsc_code",
                },
                bankName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    field: "bank_name",
                },
                branchName: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    field: "branch_name",
                },
                accountType: {
                    type: DataTypes.ENUM("savings", "current"),
                    allowNull: false,
                    defaultValue: "savings",
                    field: "account_type",
                },
                upiId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    field: "upi_id",
                },
                isVerified: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    field: "is_verified",
                },
                verifiedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    field: "verified_at",
                },
                verifiedBy: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    field: "verified_by",
                    references: {
                        model: "users",
                        key: "id",
                    },
                },
            },
            {
                sequelize,
                modelName: "BankInfo",
                tableName: "bank_infos",
                timestamps: true,
                underscored: true,
                hooks: {
                    beforeCreate: (bankInfo) => {
                        if (bankInfo.accountNumber && !bankInfo.accountNumber.includes(':')) {
                            bankInfo.accountNumber = encrypt(bankInfo.accountNumber);
                        }
                    },
                    beforeUpdate: (bankInfo) => {
                        if (bankInfo.changed("accountNumber")) {
                            if (bankInfo.accountNumber && !bankInfo.accountNumber.includes(':')) {
                                bankInfo.accountNumber = encrypt(bankInfo.accountNumber);
                            }
                        }
                    },
                },
            }
        );
    }

    static associate(models) {
        BankInfo.belongsTo(models.User, {
            foreignKey: "userId",
            as: "user",
        });
        BankInfo.belongsTo(models.User, {
            foreignKey: "verifiedBy",
            as: "verifier",
        });
    }
}

module.exports = BankInfo;
