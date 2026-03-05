import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class SkudQrToken extends Model {}

SkudQrToken.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "employee_id",
    },
    externalSystem: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "sigur",
      field: "external_system",
    },
    jti: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    tokenHash: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: "token_hash",
    },
    tokenType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "persistent",
      field: "token_type",
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
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "revoked_at",
    },
    issuedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "issued_by",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: "SkudQrToken",
    tableName: "skud_qr_tokens",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["external_system", "jti"],
      },
      {
        unique: true,
        fields: ["external_system", "token_hash"],
      },
      {
        fields: ["employee_id", "expires_at"],
      },
    ],
  },
);

export default SkudQrToken;
