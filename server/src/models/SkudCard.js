import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database.js";

class SkudCard extends Model {}

SkudCard.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "employee_id",
    },
    externalSystem: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "sigur",
      field: "external_system",
    },
    externalCardId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "external_card_id",
    },
    cardNumber: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: "card_number",
    },
    cardNumberNormalized: {
      type: DataTypes.STRING(128),
      allowNull: false,
      field: "card_number_normalized",
    },
    cardType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "rfid",
      field: "card_type",
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "active",
    },
    issuedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "issued_at",
    },
    blockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "blocked_at",
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_seen_at",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    modelName: "SkudCard",
    tableName: "skud_cards",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["external_system", "card_number_normalized"],
      },
      {
        fields: ["employee_id"],
      },
      {
        fields: ["status"],
      },
    ],
  },
);

export default SkudCard;
