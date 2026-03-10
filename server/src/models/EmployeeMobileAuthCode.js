import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class EmployeeMobileAuthCode extends Model {}

EmployeeMobileAuthCode.init(
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
    codeHash: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: "code_hash",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expires_at",
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "used_at",
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: "max_attempts",
    },
    deliveryChannel: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "log",
      field: "delivery_channel",
    },
    requestIp: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "request_ip",
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
    modelName: "EmployeeMobileAuthCode",
    tableName: "employee_mobile_auth_codes",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: "idx_employee_mobile_auth_codes_employee_id",
        fields: ["employee_id"],
      },
      {
        name: "idx_employee_mobile_auth_codes_phone_expires",
        fields: ["phone_normalized", "expires_at"],
      },
    ],
  },
);

export default EmployeeMobileAuthCode;
