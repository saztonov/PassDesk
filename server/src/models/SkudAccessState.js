import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class SkudAccessState extends Model {}

SkudAccessState.init(
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
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
    statusReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "status_reason",
    },
    reasonCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "reason_code",
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "manual",
    },
    effectiveFrom: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "effective_from",
    },
    effectiveTo: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "effective_to",
    },
    changedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "changed_by",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: "SkudAccessState",
    tableName: "skud_access_states",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["employee_id", "external_system"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["updated_at"],
      },
    ],
  },
);

export default SkudAccessState;
