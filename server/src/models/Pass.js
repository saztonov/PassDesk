import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Pass extends Model {}

Pass.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'employee_id',
      references: {
        model: 'employees',
        key: 'id'
      }
    },
    passNumber: {
      type: DataTypes.STRING,
      field: 'pass_number',
      comment: 'Уникальный номер пропуска'
    },
    passType: {
      type: DataTypes.ENUM('temporary', 'permanent', 'visitor', 'contractor'),
      allowNull: false,
      field: 'pass_type',
      defaultValue: 'temporary'
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'valid_from'
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'valid_until'
    },
    accessZones: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      field: 'access_zones',
      comment: 'Массив зон доступа, например: ["building_a", "floor_1", "office_101"]'
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'revoked', 'pending'),
      defaultValue: 'pending',
      allowNull: false
    },
    qrCode: {
      type: DataTypes.TEXT,
      field: 'qr_code',
      comment: 'QR код для сканирования'
    },
    documentFileKey: {
      type: DataTypes.STRING,
      field: 'document_file_key',
      comment: 'Ключ файла документа на Яндекс.Диске'
    },
    documentFileUrl: {
      type: DataTypes.STRING,
      field: 'document_file_url',
      comment: 'URL файла документа'
    },
    notes: {
      type: DataTypes.TEXT
    },
    issuedBy: {
      type: DataTypes.UUID,
      field: 'issued_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    revokedBy: {
      type: DataTypes.UUID,
      field: 'revoked_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    revokedAt: {
      type: DataTypes.DATE,
      field: 'revoked_at'
    },
    revokeReason: {
      type: DataTypes.TEXT,
      field: 'revoke_reason'
    }
  },
  {
    sequelize,
    modelName: 'Pass',
    tableName: 'passes',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['employee_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['valid_from', 'valid_until']
      },
      {
        fields: ['pass_number'],
        unique: true
      }
    ],
    hooks: {
      beforeCreate: async (pass) => {
        // Автогенерация номера пропуска, если не указан
        if (!pass.passNumber) {
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          pass.passNumber = `PASS-${timestamp}-${random}`;
        }
      }
    }
  }
);

export default Pass;
