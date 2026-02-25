import { useState, useEffect } from "react";
import { Table, Button, Space, Tag, Tooltip } from "antd";
import { EyeOutlined, EditOutlined, FileTextOutlined } from "@ant-design/icons";
import { useEmployees, useEmployeeActions } from "@/entities/employee";
import { employeeApi } from "@/entities/employee";
import { ExportDateFilter } from "@/features/export-date-filter";
import StatusUploadToggle from "@/modules/employees/ui/StatusUploadToggle";
import EmployeeViewModal from "@/modules/employees/ui/EmployeeViewModal";
import EmployeeFormModal from "@/modules/employees/ui/EmployeeFormModal";
import ExcelExportModal from "@/modules/employees/ui/ExcelExportModal";

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

/**
 * Страница выгрузки сотрудников для администрирования
 * Отображает таблицу со всеми данными сотрудников с фильтрацией по дате
 */
const ExportPage = () => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isExcelExportModalOpen, setIsExcelExportModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
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

  // Загружаем ДОМ только активных сотрудников (с фильтрацией по статусам и датам)
  const { employees, loading, refetch } = useEmployees(true, filterParams);

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

      // Проверяем есть ли у сотрудника статусы с is_upload = true
      // Если есть - устанавливаем статус "Редактирован" с is_upload = true
      if (
        selectedEmployee.statusMappings &&
        selectedEmployee.statusMappings.length > 0
      ) {
        const hasUploadedStatus = selectedEmployee.statusMappings.some(
          (mapping) => mapping.isUpload,
        );

        if (hasUploadedStatus) {
          try {
            // Устанавливаем статус "Редактирован" с is_upload = true
            await employeeApi.setEditedStatus(selectedEmployee.id, true);
          } catch (error) {
            console.warn("Error setting edited status:", error);
          }
        }
      }
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
  const handleStatusUploadUpdate = (_employeeId, _updatedMappings) => {
    // Обновляем employees напрямую, без setEmployees (используем что вернул useEmployees)
    // Просто перезагружаем данные с сервера
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
    refetch();
  };

  // Функция для применения табличных фильтров к employees
  // Фильтры работают так же как в таблице
  const getFilteredEmployees = () => {
    let filtered = [...employees];

    // Применяем фильтры из таблицы (position, department, counterparty, citizenship, isUpload, status)
    if (tableFilters.position && tableFilters.position.length > 0) {
      filtered = filtered.filter((emp) =>
        tableFilters.position.includes(emp.position?.name),
      );
    }

    if (tableFilters.department && tableFilters.department.length > 0) {
      filtered = filtered.filter((emp) => {
        const mappings = emp.employeeCounterpartyMappings || [];
        return mappings.some((m) =>
          tableFilters.department.includes(m.department?.name),
        );
      });
    }

    if (tableFilters.counterparty && tableFilters.counterparty.length > 0) {
      filtered = filtered.filter((emp) => {
        const mappings = emp.employeeCounterpartyMappings || [];
        return mappings.some((m) =>
          tableFilters.counterparty.includes(m.counterparty?.name),
        );
      });
    }

    if (tableFilters.citizenship && tableFilters.citizenship.length > 0) {
      filtered = filtered.filter((emp) =>
        tableFilters.citizenship.includes(emp.citizenship?.name),
      );
    }

    if (tableFilters.isUpload && tableFilters.isUpload.length > 0) {
      filtered = filtered.filter((emp) => {
        const statusMappings = emp.statusMappings || [];
        if (statusMappings.length === 0) return false;
        const allUploaded = statusMappings.every((sm) => sm.isUpload);

        if (tableFilters.isUpload.includes("uploaded")) {
          return allUploaded;
        }
        if (tableFilters.isUpload.includes("not_uploaded")) {
          return !allUploaded;
        }
        return true;
      });
    }

    if (tableFilters.status && tableFilters.status.length > 0) {
      filtered = filtered.filter((emp) => {
        const statusMappings = emp.statusMappings || [];

        // Фильтруем только активные статусы
        const activeStatusMappings = statusMappings.filter((m) => m.isActive);

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

        return tableFilters.status.some((value) => {
          if (value === "fired") {
            return (
              activeStatus === "status_active_fired" ||
              activeStatus === "status_active_fired_compl"
            );
          }
          if (value === "fired_off") {
            return hrStatus === "status_hr_fired_off";
          }
          if (value === "edited") {
            return hrStatus === "status_hr_edited";
          }
          if (value === "active") {
            // Действующий = текущий active-статус или legacy main-статусы
            return (
              activeStatus === "status_active_employed" ||
              mainStatus === "status_new" ||
              mainStatus === "status_tb_passed" ||
              mainStatus === "status_processed"
            );
          }

          return false;
        });
      });
    }

    return filtered;
  };

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

    return statusMap[mainStatus] || { name: "-", color: "default" };
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
      filters: [
        ...new Set(employees.map((e) => e.position?.name).filter(Boolean)),
      ].map((name) => ({
        text: name,
        value: name,
      })),
      filteredValue: tableFilters.position || [],
      onFilter: (value, record) => record.position?.name === value,
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
      filters: [
        ...new Set(
          employees
            .map((e) => e.employeeCounterpartyMappings?.[0]?.department?.name)
            .filter(Boolean),
        ),
      ].map((name) => ({
        text: name,
        value: name,
      })),
      filteredValue: tableFilters.department || [],
      onFilter: (value, record) => {
        const mappings = record.employeeCounterpartyMappings || [];
        return mappings.some((m) => m.department?.name === value);
      },
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
      filters: [
        ...new Set(
          employees
            .flatMap((e) => e.employeeCounterpartyMappings || [])
            .map((m) => m.counterparty?.name)
            .filter(Boolean),
        ),
      ].map((name) => ({
        text: name,
        value: name,
      })),
      filteredValue: tableFilters.counterparty || [],
      onFilter: (value, record) => {
        const mappings = record.employeeCounterpartyMappings || [];
        return mappings.some((m) => m.counterparty?.name === value);
      },
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
      filters: [
        ...new Set(employees.map((e) => e.citizenship?.name).filter(Boolean)),
      ].map((name) => ({
        text: name,
        value: name,
      })),
      filteredValue: tableFilters.citizenship || [],
      onFilter: (value, record) => record.citizenship?.name === value,
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
      onFilter: (value, record) => {
        const statusMappings = record.statusMappings || [];
        if (statusMappings.length === 0) return false;

        const allUploaded = statusMappings.every((sm) => sm.isUpload);

        if (value === "uploaded") {
          return allUploaded;
        }
        if (value === "not_uploaded") {
          return !allUploaded;
        }
        return true;
      },
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
      onFilter: (value, record) => {
        const statusMappings = record.statusMappings || [];

        // Фильтруем только активные статусы
        const activeStatusMappings = statusMappings.filter((m) => m.isActive);

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

        if (value === "fired") {
          return (
            activeStatus === "status_active_fired" ||
            activeStatus === "status_active_fired_compl"
          );
        }
        if (value === "fired_off") {
          return hrStatus === "status_hr_fired_off";
        }
        if (value === "edited") {
          return hrStatus === "status_hr_edited";
        }
        if (value === "active") {
          // Действующий = текущий active-статус или legacy main-статусы
          return (
            activeStatus === "status_active_employed" ||
            mainStatus === "status_new" ||
            mainStatus === "status_tb_passed" ||
            mainStatus === "status_processed"
          );
        }

        return false;
      },
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
    <div style={{ padding: "16px 0" }}>
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
        dataSource={employees}
        rowKey="id"
        loading={loading}
        size="small"
        onChange={(pag, filters, _sorter) => {
          // Сохраняем фильтры при изменении
          setTableFilters(filters);
        }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: employees.length,
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
        scroll={{ x: 1300, y: 600 }}
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
        employees={getFilteredEmployees()}
        onCancel={handleCloseExcelExportModal}
        onSuccess={handleExcelExportSuccess}
      />
    </div>
  );
};

export default ExportPage;
