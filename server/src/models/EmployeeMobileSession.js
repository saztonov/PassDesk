import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class EmployeeMobileSession extends Model {}

EmployeeMobileSession.init(
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
      references: {
        model: "employees",
        key: "id",
      },
    },
    phoneNormalized: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: "phone_normalized",
    },
    tokenHash: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: "token_hash",
    },
    deviceLabel: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "device_label",
    },
    requestIp: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "request_ip",
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "user_agent",
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_seen_at",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expires_at",
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "revoked_at",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "updated_at",
    },
  },
  {
    sequelize,
    modelName: "EmployeeMobileSession",
    tableName: "employee_mobile_sessions",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: "idx_employee_mobile_sessions_employee_id",
        fields: ["employee_id"],
      },
      {
        name: "idx_employee_mobile_sessions_expires_at",
        fields: ["expires_at"],
      },
      {
        name: "idx_employee_mobile_sessions_phone",
        fields: ["phone_normalized"],
      },
    ],
  },
);

export default EmployeeMobileSession;
