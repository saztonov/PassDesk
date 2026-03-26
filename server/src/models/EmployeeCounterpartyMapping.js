import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../config/database.js';

class EmployeeCounterpartyMapping extends Model {}

const collectUniqueEmployeeIds = (items = []) => [
  ...new Set(
    items
      .map((item) => item?.employeeId || item?.employee_id || null)
      .filter(Boolean),
  ),
];

export const touchEmployeesForMappings = async (
  employeeIds,
  options = {},
) => {
  const ids = collectUniqueEmployeeIds(employeeIds);
  if (ids.length === 0) {
    return;
  }

  const EmployeeModel = sequelize.models.Employee;
  if (!EmployeeModel) {
    return;
  }

  await EmployeeModel.update(
    { updatedAt: new Date() },
    {
      where: {
        id: {
          [Op.in]: ids,
        },
      },
      transaction: options.transaction,
    },
  );
};

const rememberBulkEmployeeIds = async (options = {}) => {
  const where = options.where || {};
  const rows = await EmployeeCounterpartyMapping.findAll({
    where,
    attributes: ['employeeId'],
    transaction: options.transaction,
    raw: true,
  });

  options._touchedEmployeeIds = collectUniqueEmployeeIds(rows);
};

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
    hooks: {
      async afterCreate(mapping, options) {
        await touchEmployeesForMappings([mapping], options);
      },
      async afterUpdate(mapping, options) {
        await touchEmployeesForMappings([mapping], options);
      },
      async afterDestroy(mapping, options) {
        await touchEmployeesForMappings([mapping], options);
      },
      async afterBulkCreate(mappings, options) {
        await touchEmployeesForMappings(mappings, options);
      },
      async beforeBulkUpdate(options) {
        await rememberBulkEmployeeIds(options);
      },
      async afterBulkUpdate(options) {
        await touchEmployeesForMappings(options._touchedEmployeeIds, options);
      },
      async beforeBulkDestroy(options) {
        await rememberBulkEmployeeIds(options);
      },
      async afterBulkDestroy(options) {
        await touchEmployeesForMappings(options._touchedEmployeeIds, options);
      },
    },
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
