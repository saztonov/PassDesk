import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class File extends Model {}

File.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fileKey: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "file_key",
      comment: "Ключ файла на Яндекс.Диске",
    },
    fileName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "file_name",
    },
    originalName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "original_name",
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "mime_type",
    },
    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "file_size",
      comment: "Размер файла в байтах",
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "file_path",
      comment: "Полный путь на Яндекс.Диске",
    },
    publicUrl: {
      type: DataTypes.STRING,
      field: "public_url",
      comment: "Публичная ссылка на файл",
    },
    resourceId: {
      type: DataTypes.STRING,
      field: "resource_id",
      comment: "Resource ID от Яндекс.Диска",
    },
    entityType: {
      type: DataTypes.ENUM("employee", "pass", "application", "other"),
      field: "entity_type",
      comment: "Тип связанной сущности",
    },
    entityId: {
      type: DataTypes.UUID,
      field: "entity_id",
      comment: "ID связанной сущности",
    },
    documentType: {
      type: DataTypes.ENUM(
        "passport",
        "passport_translation",
        "patent_front",
        "patent_back",
        "visa",
        "biometric_consent",
        "biometric_consent_developer",
        "application_scan",
        "consent",
        "bank_details",
        "snils_card",
        "kig",
        "diploma",
        "med_book",
        "migration_card",
        "arrival_notice",
        "patent_payment_receipt",
        "mvd_notification",
        "other",
      ),
      field: "document_type",
      allowNull: true,
      comment:
        "Тип документа: passport, passport_translation, patent_front, patent_back, visa, biometric_consent, biometric_consent_developer, consent, bank_details, snils_card, diploma, arrival_notice, patent_payment_receipt и др.",
    },
    employeeId: {
      type: DataTypes.UUID,
      field: "employee_id",
      allowNull: true,
      references: {
        model: "employees",
        key: "id",
      },
      onDelete: "CASCADE",
      comment: "ID сотрудника (явная связь)",
    },
    uploadedBy: {
      type: DataTypes.UUID,
      field: "uploaded_by",
      references: {
        model: "users",
        key: "id",
      },
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_deleted",
    },
  },
  {
    sequelize,
    modelName: "File",
    tableName: "files",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ["file_key"],
        unique: true,
      },
      {
        fields: ["entity_type", "entity_id"],
      },
      {
        fields: ["employee_id"],
      },
      {
        fields: ["uploaded_by"],
      },
    ],
  },
);

export default File;
