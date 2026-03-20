import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";
import { decryptField } from "../services/encryptionService.js";

const isEmptyValue = (value) =>
  value === null || value === undefined || value === "";

const restoreEncryptedValue = (values, plainKey, encryptedKey, keyVersionKey) => {
  if (!isEmptyValue(values[plainKey])) {
    return;
  }

  const encryptedPayload = values[encryptedKey];
  const keyVersion = values[keyVersionKey];
  if (!encryptedPayload || !keyVersion) {
    return;
  }

  try {
    const decrypted = decryptField(encryptedPayload, keyVersion);
    if (!isEmptyValue(decrypted)) {
      values[plainKey] = decrypted;
    }
  } catch {
    // Keep plaintext fallback (or null) if decryption is unavailable.
  }
};

const resolveSensitiveFieldValue = (
  instance,
  plainKey,
  encryptedKey,
  keyVersionKey,
) => {
  const plainValue = instance.getDataValue(plainKey);
  if (!isEmptyValue(plainValue)) {
    return plainValue;
  }

  const encryptedPayload = instance.getDataValue(encryptedKey);
  const keyVersion = instance.getDataValue(keyVersionKey);
  if (!encryptedPayload || !keyVersion) {
    return plainValue ?? null;
  }

  try {
    return decryptField(encryptedPayload, keyVersion);
  } catch {
    return plainValue ?? null;
  }
};

class Employee extends Model {
  toJSON() {
    const values = { ...this.get() };

    restoreEncryptedValue(values, "lastName", "lastNameEnc", "lastNameKeyVersion");
    restoreEncryptedValue(
      values,
      "passportNumber",
      "passportNumberEnc",
      "passportNumberKeyVersion",
    );
    restoreEncryptedValue(values, "kig", "kigEnc", "kigKeyVersion");
    restoreEncryptedValue(
      values,
      "patentNumber",
      "patentNumberEnc",
      "patentNumberKeyVersion",
    );

    delete values.lastNameEnc;
    delete values.lastNameHash;
    delete values.lastNameKeyVersion;
    delete values.passportNumberEnc;
    delete values.passportNumberHash;
    delete values.passportNumberKeyVersion;
    delete values.kigEnc;
    delete values.kigHash;
    delete values.kigKeyVersion;
    delete values.patentNumberEnc;
    delete values.patentNumberHash;
    delete values.patentNumberKeyVersion;

    return values;
  }
}

Employee.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true, // Разрешаем null для черновиков
      field: "first_name",
    },
    lastName: {
      type: DataTypes.VIRTUAL,
      allowNull: true, // Разрешаем null для черновиков
      get() {
        return resolveSensitiveFieldValue(
          this,
          "lastName",
          "lastNameEnc",
          "lastNameKeyVersion",
        );
      },
      set(value) {
        this.setDataValue("lastName", value);
      },
    },
    lastNameEnc: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "last_name_enc",
    },
    lastNameHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "last_name_hash",
    },
    lastNameKeyVersion: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: "last_name_key_version",
    },
    middleName: {
      type: DataTypes.STRING,
      field: "middle_name",
    },
    gender: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: "gender",
      comment: "Пол (male или female)",
    },
    positionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "position_id",
      references: {
        model: "positions",
        key: "id",
      },
      comment: "Должность сотрудника",
    },
    citizenshipId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "citizenship_id",
      references: {
        model: "citizenships",
        key: "id",
      },
      comment: "Гражданство",
    },
    birthCountryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "birth_country_id",
      references: {
        model: "citizenships",
        key: "id",
      },
      comment: "Страна рождения",
    },
    birthDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "birth_date",
      comment: "Дата рождения",
    },
    inn: {
      type: DataTypes.STRING(12),
      allowNull: true,
      unique: true,
      field: "inn",
      validate: {
        isValidInn(value) {
          // Пропускаем пустые значения (null, undefined, пустая строка)
          if (!value || value.trim() === "") {
            return;
          }
          if (value.length !== 10 && value.length !== 12) {
            throw new Error("ИНН должен содержать 10 или 12 цифр");
          }
          if (!/^\d+$/.test(value)) {
            throw new Error("ИНН должен содержать только цифры");
          }
        },
      },
      comment: "ИНН сотрудника (уникальный)",
    },
    snils: {
      type: DataTypes.STRING(14),
      allowNull: true,
      unique: true,
      field: "snils",
      validate: {
        isValidSnils(value) {
          // Пропускаем пустые значения (null, undefined, пустая строка)
          if (!value || value.trim() === "") {
            return;
          }
          // СНИЛС должен содержать только 11 цифр
          if (!/^\d{11}$/.test(value)) {
            throw new Error("СНИЛС должен содержать 11 цифр");
          }
        },
      },
      comment: "СНИЛС сотрудника (уникальный)",
    },
    kig: {
      type: DataTypes.VIRTUAL,
      allowNull: true,
      get() {
        return resolveSensitiveFieldValue(this, "kig", "kigEnc", "kigKeyVersion");
      },
      set(value) {
        this.setDataValue("kig", value);
      },
    },
    kigEnc: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "kig_enc",
    },
    kigHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "kig_hash",
    },
    kigKeyVersion: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: "kig_key_version",
    },
    passportNumber: {
      type: DataTypes.VIRTUAL,
      allowNull: true,
      get() {
        return resolveSensitiveFieldValue(
          this,
          "passportNumber",
          "passportNumberEnc",
          "passportNumberKeyVersion",
        );
      },
      set(value) {
        this.setDataValue("passportNumber", value);
      },
    },
    passportNumberEnc: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "passport_number_enc",
    },
    passportNumberHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "passport_number_hash",
    },
    passportNumberKeyVersion: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: "passport_number_key_version",
    },
    passportDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "passport_date",
      comment: "Дата выдачи паспорта",
    },
    passportIssuer: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "passport_issuer",
      comment: "Кем выдан паспорт",
    },
    passportType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: "passport_type",
      comment: "Тип паспорта (russian или foreign)",
    },
    passportExpiryDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "passport_expiry_date",
      comment: "Дата окончания иностранного паспорта",
    },
    kigEndDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "kig_end_date",
      comment: "Дата окончания КИГ",
    },
    registrationAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "registration_address",
      comment: "Адрес регистрации",
    },
    patentNumber: {
      type: DataTypes.VIRTUAL,
      allowNull: true,
      get() {
        return resolveSensitiveFieldValue(
          this,
          "patentNumber",
          "patentNumberEnc",
          "patentNumberKeyVersion",
        );
      },
      set(value) {
        this.setDataValue("patentNumber", value);
      },
    },
    patentNumberEnc: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "patent_number_enc",
    },
    patentNumberHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "patent_number_hash",
    },
    patentNumberKeyVersion: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: "patent_number_key_version",
    },
    patentIssueDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "patent_issue_date",
      comment: "Дата выдачи патента",
    },
    blankNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "blank_number",
      comment: "Номер бланка документа",
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isValidEmail(value) {
          if (value && value.length > 0) {
            // Простая проверка email
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              throw new Error("Введите корректный email");
            }
          }
        },
      },
    },
    phone: {
      type: DataTypes.STRING,
      validate: {
        isValidPhone(value) {
          // Пропускаем пустые значения (null, undefined, пустая строка)
          if (!value || value.trim() === "") {
            return;
          }
          // Телефон должен быть в формате +79101234567
          if (!/^\+\d{11}$/.test(value)) {
            throw new Error("Телефон должен быть в формате +79101234567");
          }
        },
      },
    },
    insurancePolicyNumber: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "insurance_policy_number",
      comment: "Номер страхового полиса",
    },
    insurancePolicyDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: "insurance_policy_date",
      comment: "Дата выдачи страхового полиса",
    },
    bankAccountNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: "bank_account_number",
      validate: {
        isValidBankAccountNumber(value) {
          if (!value || value.trim() === "") {
            return;
          }
          if (!/^\d{20}$/.test(value)) {
            throw new Error(
              "Номер банковского счета должен содержать 20 цифр",
            );
          }
        },
      },
      comment: "Номер банковского счета (20 цифр)",
    },
    notes: {
      type: DataTypes.TEXT,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: "is_active",
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
    markedForDeletion: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "marked_for_deletion",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false, // Обязательное поле - каждый сотрудник должен иметь создателя
      field: "created_by",
      references: {
        model: "users",
        key: "id",
      },
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      field: "updated_by",
      references: {
        model: "users",
        key: "id",
      },
    },
    idAll: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
      field: "id_all",
      comment: "ID из внешней системы (для маппинга сотрудников)",
    },
  },
  {
    sequelize,
    modelName: "Employee",
    tableName: "employees",
    timestamps: true,
    underscored: true,
    hooks: {
      beforeUpdate(employee) {
        // Разрешаем только первичное заполнение id_all, но запрещаем его менять после установки.
        if (employee.changed("idAll")) {
          const previousValue = employee.previous("idAll");
          if (!previousValue) {
            return;
          }
          throw new Error(
            "Поле id_all (ID из внешней системы) не может быть изменено",
          );
        }
      },
    },
    indexes: [
      {
        fields: ["position_id"],
      },
      {
        fields: ["is_active"],
      },
      {
        fields: ["counterparty_id"],
      },
      {
        fields: ["citizenship_id"],
      },
      {
        fields: ["birth_country_id"],
      },
      {
        fields: ["inn"],
      },
      {
        fields: ["snils"],
      },
      {
        fields: ["id_all"],
      },
    ],
  },
);

export default Employee;
