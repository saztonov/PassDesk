import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";
import bcrypt from "bcryptjs";

class User extends Model {
  // Метод для проверки пароля
  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }

  // Метод для скрытия пароля при сериализации
  toJSON() {
    const values = { ...this.get() };
    delete values.password;
    return values;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "first_name",
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "last_name",
    },
    role: {
      type: DataTypes.ENUM(
        "admin",
        "user",
        "laborer",
        "manager",
        "ot_engineer",
        "ot_admin",
      ),
      defaultValue: "user",
      allowNull: false,
    },
    counterpartyId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "counterparty_id",
      references: {
        model: "counterparties",
        key: "id",
      },
    },
    identificationNumber: {
      type: DataTypes.STRING(6),
      allowNull: true,
      unique: true,
      field: "identification_number",
      comment:
        "Уникальный идентификационный номер (УИН) пользователя в формате xxxxxx",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_active",
      comment: "Флаг активации пользователя администратором",
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_deleted",
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "deleted_at",
    },
    lastLogin: {
      type: DataTypes.DATE,
      field: "last_login",
    },
    passwordChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "password_changed_at",
    },
    userLanguage: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: "ru",
      field: "user_language",
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: true,
    underscored: true,
    hooks: {
      // Хэшировать пароль перед сохранением
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(
            parseInt(process.env.BCRYPT_ROUNDS) || 10,
          );
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed("password")) {
          const salt = await bcrypt.genSalt(
            parseInt(process.env.BCRYPT_ROUNDS) || 10,
          );
          user.password = await bcrypt.hash(user.password, salt);
          user.passwordChangedAt = new Date();
        }
      },
    },
  },
);

export default User;
