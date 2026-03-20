import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const ConstructionSite = sequelize.define('ConstructionSite', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  shortName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'short_name',
    validate: {
      notEmpty: {
        msg: 'Краткое название не может быть пустым'
      }
    }
  },
  fullName: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'full_name',
    validate: {
      notEmpty: {
        msg: 'Полное название не может быть пустым'
      }
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Адрес не может быть пустым'
      }
    }
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'created_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  updatedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'updated_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    field: 'updated_at'
  }
}, {
  tableName: 'construction_sites',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      name: 'idx_construction_sites_short_name',
      fields: ['short_name']
    }
  ]
});

export default ConstructionSite;

