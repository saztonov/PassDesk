import { useState, useEffect, useMemo } from "react";
import { Table, Button, Space, Tag, Tooltip } from "antd";
import { EyeOutlined, EditOutlined, FileTextOutlined } from "@ant-design/icons";
import { useEmployees, useEmployeeActions } from "@/entities/employee";
import { ExportDateFilter } from "@/features/export-date-filter";
import StatusUploadToggle from "@/modules/employees/ui/StatusUploadToggle";
import EmployeeViewModal from "@/modules/employees/ui/EmployeeViewModal";
import EmployeeFormModal from "@/modules/employees/ui/EmployeeFormModal";
import ExcelExportModal from "@/modules/employees/ui/ExcelExportModal";
import { AsyncCheckboxFilterDropdown } from "@/widgets/employee-table/AsyncCheckboxFilterDropdown";
import positionService from "@/services/positionService";
import { citizenshipService } from "@/services/citizenshipService";
import { counterpartyService } from "@/services/counterpartyService";
import { departmentApi } from "@/entities/department";

const FILTER_STORAGE_KEY = "exportPageDateFilter";
const TABLE_FILTERS_STORAGE_KEY = "exportPageTableFilters";
const PAGINATION_STORAGE_KEY = "exportPagePagination";

const parseStoredJson = (key, fallbackValue) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallbackValue;
  } catch (error) {
    console.warn(`Ошибка чтения ${key} из localStorage:`, error);
    return fallbackValue;
  }
};

const normalizeFilterArray = (value) =>
  Array.isArray(value) ? value.filter(Boolean) : [];

/**
 * Страница выгрузки сотрудников для администрирования
 * Отображает таблицу со всеми данными сотрудников с фильтрацией по дате
 */
const ExportPage = () => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isExcelExportModalOpen, setIsExcelExportModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [uploadOverrides, setUploadOverrides] = useState({});
  const [pagination, setPagination] = useState(() =>
    parseStoredJson(PAGINATION_STORAGE_KEY, { current: 1, pageSize: 20 }),
  );
  const [tableFilters, setTableFilters] = useState(() =>
    parseStoredJson(TABLE_FILTERS_STORAGE_KEY, {}),
  );
  const currentPage = pagination.current || 1;
  const pageSize = pagination.pageSize || 20;

  // Инициализируем фильтр из localStorage
  const [filterParams, setFilterParams] = useState(() => {
    return parseStoredJson(FILTER_STORAGE_KEY, {});
  });

  const employeeQueryParams = useMemo(
    () => {
      const params = {
        ...filterParams,
        page: currentPage,
        limit: pageSize,
      };
      const position = normalizeFilterArray(tableFilters.position);
      const department = normalizeFilterArray(tableFilters.department);
      const counterparty = normalizeFilterArray(tableFilters.counterparty);
      const citizenship = normalizeFilterArray(tableFilters.citizenship);
      const isUpload = normalizeFilterArray(tableFilters.isUpload);
      const status = normalizeFilterArray(tableFilters.status);
      if (position.length > 0) params.positionNames = JSON.stringify(position);
      if (department.length > 0) params.departmentNames = JSON.stringify(department);
      if (counterparty.length > 0) params.counterpartyNames = JSON.stringify(counterparty);
      if (citizenship.length > 0) params.citizenshipNames = JSON.stringify(citizenship);
      if (isUpload.length > 0) params.uploadStates = JSON.stringify(isUpload);
      if (status.length > 0) params.statuses = JSON.stringify(status);
      return params;
    },
    [currentPage, pageSize, filterParams, tableFilters],
  );

  // Сохраняем фильтр при изменении
  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filterParams));
  }, [filterParams]);

  useEffect(() => {
    localStorage.setItem(
      TABLE_FILTERS_STORAGE_KEY,
      JSON.stringify(tableFilters || {}),
    );
  }, [tableFilters]);

  useEffect(() => {
    localStorage.setItem(
      PAGINATION_STORAGE_KEY,
      JSON.stringify({
        current: currentPage,
        pageSize,
      }),
    );
  }, [currentPage, pageSize]);

  // Загружаем сотрудников без жёсткого activeOnly, чтобы новые записи без статусов
  // тоже попадали в выгрузку и отображались со статусом "НЕТ".
  const {
    employees,
    loading,
    totalCount,
    refetch,
    invalidateCache,
  } = useEmployees(false, employeeQueryParams);

  // Инициализируем действия с сотрудниками
  const { updateEmployee } = useEmployeeActions(() => {
    refetch();
  });

  // Обработчики действий
  const handleView = (employee) => {
    setSelectedEmployee(employee);
    setIsViewModalOpen(true);
  };

  const handleEdit = (employee) => {
    setSelectedEmployee(employee);
    setIsEditModalOpen(true);
  };

  const handleFormSuccess = async (values) => {
    if (selectedEmployee) {
      // Обновление существующего сотрудника
      const updated = await updateEmployee(selectedEmployee.id, values);
      setSelectedEmployee(updated);
    }
    await refetch();
    setIsEditModalOpen(false);
    setSelectedEmployee(null);
  };

  // Обработчики фильтра по дате
  const handleDateFilterApply = (params) => {
    setFilterParams(params);
    setPagination({ current: 1, pageSize: 20 }); // Сбросить пагинацию
  };

  const handleDateFilterReset = () => {
    setFilterParams({});
    setPagination({ current: 1, pageSize: 20 });
    // Сбрасываем также фильтры таблицы
    setTableFilters({});
  };

  // Обработчик обновления флага is_upload
  const handleStatusUploadUpdate = (employeeId, updatedMappings) => {
    setUploadOverrides((prev) => ({
      ...prev,
      [employeeId]: updatedMappings,
    }));
    invalidateCache();
    refetch();
  };

  // Обработчик открытия модала выгрузки
  const handleOpenExcelExportModal = () => {
    setIsExcelExportModalOpen(true);
  };

  // Обработчик закрытия модала выгрузки
  const handleCloseExcelExportModal = () => {
    setIsExcelExportModalOpen(false);
  };

  // Обработчик успешной выгрузки
  const handleExcelExportSuccess = () => {
    // Временно отключено по требованию:
    // после Excel-выгрузки НЕ делаем авто-смену статуса в колонке "ЗУП".
    //
    // Старое поведение (локально отмечало выгруженными):
    // if (updatedEmployeeIds.length > 0) {
    //   setUploadOverrides((prev) => {
    //     const next = { ...prev };
    //
    //     employees.forEach((employee) => {
    //       if (!updatedEmployeeIds.includes(employee.id)) {
    //         return;
    //       }
    //
    //       next[employee.id] = (employee.statusMappings || []).map((mapping) => ({
    //         ...mapping,
    //         isUpload: true,
    //       }));
    //     });
    //
    //     return next;
    //   });
    // }
    invalidateCache();
    refetch();
  };

  const employeesWithOverrides = useMemo(
    () =>
      employees.map((employee) => {
        const overrideMappings = uploadOverrides[employee.id];
        if (!overrideMappings) {
          return employee;
        }

        return {
          ...employee,
          statusMappings: overrideMappings,
        };
      }),
    [employees, uploadOverrides],
  );

  // Получение количества файлов
  const getFilesCount = (employee) => {
    return employee.filesCount || 0;
  };

  // Определение статуса сотрудника (та же логика, что на странице Сотрудники)
  const getEmployeeStatus = (employee) => {
    const statusMappings = employee.statusMappings || [];

    // Фильтруем только активные статусы
    const activeStatusMappings = statusMappings.filter((m) => m.isActive);

    // Функция для получения статуса по группе из активных статусов
    const getStatusByGroup = (group) => {
      const mapping = activeStatusMappings.find((m) => {
        const mappingGroup = m.statusGroup || m.status_group;
        return mappingGroup === group;
      });
      if (!mapping) return null;
      const statusObj = mapping.status || mapping.Status;
      return statusObj?.name;
    };

    const activeStatus = getStatusByGroup("status_active");
    const hrStatus = getStatusByGroup("status_hr");
    const mainStatus = getStatusByGroup("status");

    // Проверяем статус "Уволен"
    if (
      activeStatus === "status_active_fired" ||
      activeStatus === "status_active_fired_compl"
    ) {
      return { name: "Уволен", color: "red" };
    }

    // Статусы из группы status_hr (приоритет выше, чем статусы в группе status)
    const hrStatusMap = {
      status_hr_fired_off: { name: "Повторно принят", color: "orange" },
      status_hr_edited: { name: "Редактирован", color: "orange" },
    };

    if (hrStatus && hrStatusMap[hrStatus]) {
      return hrStatusMap[hrStatus];
    }

    if (activeStatus === "status_active_employed") {
      return { name: "Действующий", color: "green" };
    }

    const statusMap = {
      status_new: { name: "Действующий", color: "green" },
      status_tb_passed: { name: "Действующий", color: "green" },
      status_processed: { name: "Действующий", color: "success" },
    };

    return statusMap[mainStatus] || { name: "НЕТ", color: "default" };
  };

  // Колонки таблицы
  const columns = [
    {
      title: "№",
      key: "index",
      width: 40,
      align: "center",
      render: (text, record, index) => index + 1,
    },
    {
      title: "ФИО",
      key: "fullName",
      width: 270,
      render: (text, record) =>
        `${record.lastName || ""} ${record.firstName || ""} ${record.middleName || ""}`.trim(),
      sorter: (a, b) => {
        const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
        const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
        return nameA.localeCompare(nameB);
      },
    },
    {
      title: "Должность",
      dataIndex: ["position", "name"],
      key: "position",
      render: (text) => (
        <div
          style={{
            whiteSpace: "normal",
            wordBreak: "break-word",
            wordWrap: "break-word",
            lineHeight: "1.4",
          }}
        >
          {text || "-"}
        </div>
      ),
      filterDropdown: (props) => (
        <AsyncCheckboxFilterDropdown
          {...props}
          placeholder="Поиск должности..."
          cacheKey="export-filter:positions"
          loadOptions={async () => {
            const response = await positionService.getAll({ limit: 10000 });
            const positions = response?.data?.data?.positions || [];
            return positions.map((p) => p?.name).filter(Boolean);
          }}
        />
      ),
      filteredValue: tableFilters.position || [],
    },
    {
      title: "Подразделение",
      key: "department",
      render: (_, record) => {
        const mappings = record.employeeCounterpartyMappings || [];
        const currentMapping = mappings[0];
        const currentDepartmentName = currentMapping?.department?.name;
        return (
          <div
            style={{
              whiteSpace: "normal",
              wordBreak: "break-word",
              wordWrap: "break-word",
              lineHeight: "1.4",
            }}
          >
            {currentDepartmentName || "-"}
          </div>
        );
      },
      filterDropdown: (props) => (
        <AsyncCheckboxFilterDropdown
          {...props}
          placeholder="Поиск подразделения..."
          cacheKey="export-filter:departments"
          loadOptions={async () => {
            const response = await departmentApi.getAll();
            const departments = response?.data?.departments || response?.departments || [];
            return departments.map((d) => d?.name).filter(Boolean);
          }}
        />
      ),
      filteredValue: tableFilters.department || [],
    },
    {
      title: "Контрагент",
      key: "counterparty",
      width: 150,
      render: (_, record) => {
        const mappings = record.employeeCounterpartyMappings || [];
        if (mappings.length === 0) return "-";
        const counterparties = [
          ...new Set(mappings.map((m) => m.counterparty?.name).filter(Boolean)),
        ];
        const text = counterparties.join(", ") || "-";
        return (
          <div
            style={{
              whiteSpace: "normal",
              wordBreak: "keep-all",
              overflowWrap: "break-word",
              lineHeight: "1.4",
            }}
          >
            {text}
          </div>
        );
      },
      filterDropdown: (props) => (
        <AsyncCheckboxFilterDropdown
          {...props}
          placeholder="Поиск контрагента..."
          cacheKey="export-filter:counterparties"
          loadOptions={async () => {
            const response = await counterpartyService.getAll({ limit: 10000, page: 1 });
            const counterparties = response?.data?.data?.counterparties || [];
            return counterparties.map((c) => c?.name).filter(Boolean);
          }}
        />
      ),
      filteredValue: tableFilters.counterparty || [],
    },
    {
      title: "Гражданство",
      dataIndex: ["citizenship", "name"],
      key: "citizenship",
      render: (text) => (
        <div
          style={{
            whiteSpace: "normal",
            wordBreak: "break-word",
            wordWrap: "break-word",
            lineHeight: "1.4",
          }}
        >
          {text || "-"}
        </div>
      ),
      filterDropdown: (props) => (
        <AsyncCheckboxFilterDropdown
          {...props}
          placeholder="Поиск гражданства..."
          cacheKey="export-filter:citizenships"
          loadOptions={async () => {
            const response = await citizenshipService.getAll();
            const citizenships = response?.data?.data?.citizenships || [];
            return citizenships.map((c) => c?.name).filter(Boolean);
          }}
        />
      ),
      filteredValue: tableFilters.citizenship || [],
    },
    {
      title: "ЗУП",
      key: "isUpload",
      width: 80,
      align: "center",
      render: (text, record) => {
        // Получаем все активные статусы
        const statusMappings = record.statusMappings || [];
        if (statusMappings.length === 0) {
          return "-";
        }
        return (
          <StatusUploadToggle
            employeeId={record.id}
            statusMappings={statusMappings}
            onUpdate={(updatedMappings) =>
              handleStatusUploadUpdate(record.id, updatedMappings)
            }
          />
        );
      },
      filters: [
        { text: "ДА (выгружен)", value: "uploaded" },
        { text: "НЕТ (не выгружен)", value: "not_uploaded" },
      ],
      filteredValue: tableFilters.isUpload || [],
    },
    {
      title: "Файлы",
      key: "files",
      width: 80,
      align: "center",
      render: (text, record) => {
        const count = getFilesCount(record);
        return count > 0 ? (
          <Tag color="blue" icon={<FileTextOutlined />}>
            {count}
          </Tag>
        ) : (
          <Tag color="default">0</Tag>
        );
      },
    },
    {
      title: "Статус",
      key: "status",
      width: 115,
      render: (text, record) => {
        const status = getEmployeeStatus(record);
        return <Tag color={status.color}>{status.name}</Tag>;
      },
      filters: [
        { text: "Действующий", value: "active" },
        { text: "Редактирован", value: "edited" },
        { text: "Повторно принят", value: "fired_off" },
        { text: "Уволен", value: "fired" },
      ],
      filteredValue: tableFilters.status || [],
    },
    {
      title: "Действия",
      key: "actions",
      width: 100,
      align: "center",
      fixed: "right",
      render: (text, record) => (
        <Space>
          <Tooltip title="Просмотр">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleView(record)}
            />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "16px" }}>
      <style>{`
        .export-table .ant-table-cell {
          padding: 4px 8px !important;
        }
        .export-table .ant-table-row {
          height: auto !important;
        }
      `}</style>

      {/* Блок фильтра по дате */}
      <ExportDateFilter
        initialFilter={filterParams}
        onFilter={handleDateFilterApply}
        onReset={handleDateFilterReset}
        onExcelExport={handleOpenExcelExportModal}
      />

      <Table
        className="export-table"
        columns={columns}
        dataSource={employeesWithOverrides}
        rowKey="id"
        loading={loading}
        size="small"
        onChange={(pag, filters, _sorter, extra) => {
          if (extra?.action === "filter") {
            setTableFilters(filters);
          }
          setPagination((prev) => ({
            current:
              extra?.action === "filter"
                ? 1
                : pag?.current || prev.current || 1,
            pageSize: pag?.pageSize || prev.pageSize || 20,
          }));
        }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: totalCount,
          showSizeChanger: true,
          showTotal: (total) => `Всего: ${total}`,
          pageSizeOptions: ["10", "20", "50", "100"],
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize });
          },
          onShowSizeChange: (current, pageSize) => {
            setPagination({ current: 1, pageSize });
          },
        }}
        scroll={{ x: 1300 }}
      />

      {/* Модальное окно просмотра */}
      <EmployeeViewModal
        visible={isViewModalOpen}
        employee={selectedEmployee}
        onCancel={() => {
          setIsViewModalOpen(false);
          setSelectedEmployee(null);
        }}
        onEdit={() => {
          setIsViewModalOpen(false);
          setIsEditModalOpen(true);
        }}
      />

      {/* Модальное окно редактирования */}
      <EmployeeFormModal
        visible={isEditModalOpen}
        employee={selectedEmployee}
        onCancel={() => {
          setIsEditModalOpen(false);
          setSelectedEmployee(null);
        }}
        onSuccess={handleFormSuccess}
      />

      {/* Модальное окно выгрузки в Excel */}
      <ExcelExportModal
          visible={isExcelExportModalOpen}
          employees={employeesWithOverrides}
          onCancel={handleCloseExcelExportModal}
        onSuccess={handleExcelExportSuccess}
      />
    </div>
  );
};

export default ExportPage;
