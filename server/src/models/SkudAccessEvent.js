import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class SkudAccessEvent extends Model {}

SkudAccessEvent.init(
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    externalSystem: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "sigur",
      field: "external_system",
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "webdel",
    },
    eventType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "passage",
      field: "event_type",
    },
    logId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "log_id",
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "employee_id",
    },
    externalEmpId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "external_emp_id",
    },
    accessPoint: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "access_point",
    },
    direction: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    keyHex: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "key_hex",
    },
    allow: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    decisionMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "decision_message",
    },
    eventTime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "event_time",
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: "raw_payload",
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "created_at",
    },
  },
  {
    sequelize,
    modelName: "SkudAccessEvent",
    tableName: "skud_access_events",
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ["employee_id", "event_time"],
      },
      {
        fields: ["access_point", "event_time"],
      },
    ],
  },
);

export default SkudAccessEvent;
