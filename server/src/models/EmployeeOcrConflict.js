import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class EmployeeOcrConflict extends Model {}

EmployeeOcrConflict.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "employee_id",
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "file_id",
    },
    documentType: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "document_type",
    },
    ocrDocumentType: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "ocr_document_type",
    },
    fieldName: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "field_name",
    },
    fieldLabel: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: "field_label",
    },
    currentValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "current_value",
    },
    ocrValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "ocr_value",
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "open",
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "created_by",
    },
    resolvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "resolved_by",
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "resolved_at",
    },
    notificationSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "notification_sent_at",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: "EmployeeOcrConflict",
    tableName: "employee_ocr_conflicts",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["employee_id", "file_id", "field_name"],
      },
      {
        fields: ["employee_id", "status", "created_at"],
      },
      {
        fields: ["status", "created_at"],
      },
    ],
  },
);

export default EmployeeOcrConflict;
