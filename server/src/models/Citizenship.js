import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Citizenship = sequelize.define('Citizenship', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
    comment: 'Уникальный идентификатор гражданства'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: {
        msg: 'Название гражданства не может быть пустым'
      }
    }
  },
  code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Код страны (ISO 3166-1 alpha-2)'
  },
  requiresPatent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'requires_patent',
    comment: 'Требуется ли патент для данного гражданства'
  },
  isEaeu: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_eaeu',
    comment: 'Относится ли гражданство к странам ЕАЭС (без РФ)'
  }
}, {
  sequelize,
  modelName: 'Citizenship',
  tableName: 'citizenships',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['name']
    }
  ]
});

export default Citizenship;
