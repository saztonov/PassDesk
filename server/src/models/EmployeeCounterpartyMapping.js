import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class EmployeeCounterpartyMapping extends Model {}

EmployeeCounterpartyMapping.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      comment: 'Уникальный идентификатор записи маппинга'
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'employee_id',
      references: {
        model: 'employees',
        key: 'id'
      },
      comment: 'ID сотрудника'
    },
    counterpartyId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'counterparty_id',
      references: {
        model: 'counterparties',
        key: 'id'
      },
      comment: 'ID контрагента'
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'department_id',
      references: {
        model: 'departments',
        key: 'id'
      },
      comment: 'ID подразделения (может быть NULL)'
    },
    constructionSiteId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'construction_site_id',
      references: {
        model: 'construction_sites',
        key: 'id'
      },
      comment: 'ID объекта строительства (может быть NULL)'
    },
    dismissedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'dismissed_at',
      comment: 'Последняя актуальная дата увольнения сотрудника у контрагента'
    }
  },
  {
    sequelize,
    modelName: 'EmployeeCounterpartyMapping',
    tableName: 'employee_counterparty_mapping',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['employee_id']
      },
      {
        fields: ['counterparty_id']
      },
      {
        fields: ['department_id']
      },
      {
        fields: ['construction_site_id']
      },
      {
        fields: ['dismissed_at']
      }
      // Уникальный индекс создан в миграции: unique_employee_counterparty_site_mapping
    ]
  }
);

export default EmployeeCounterpartyMapping;
