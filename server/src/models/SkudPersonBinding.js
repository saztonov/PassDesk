import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class SkudPersonBinding extends Model {}

SkudPersonBinding.init(
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
    externalEmpId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: "external_emp_id",
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "manual",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "created_by",
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "updated_by",
    },
  },
  {
    sequelize,
    modelName: "SkudPersonBinding",
    tableName: "skud_person_bindings",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["external_system", "external_emp_id"],
      },
      {
        unique: true,
        fields: ["employee_id", "external_system"],
      },
      {
        fields: ["employee_id"],
      },
      {
        fields: ["is_active"],
      },
    ],
  },
);

export default SkudPersonBinding;
