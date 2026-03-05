import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class SkudSyncJob extends Model {}

SkudSyncJob.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    externalSystem: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "sigur",
      field: "external_system",
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "employee_id",
    },
    operation: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    responsePayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: "response_payload",
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "error_message",
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "processed_at",
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "created_by",
    },
  },
  {
    sequelize,
    modelName: "SkudSyncJob",
    tableName: "skud_sync_jobs",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ["status", "created_at"],
      },
      {
        fields: ["employee_id", "created_at"],
      },
    ],
  },
);

export default SkudSyncJob;
