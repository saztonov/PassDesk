import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Table,
  Button,
  Space,
  App,
  Empty,
  Checkbox,
  Segmented,
  Input,
} from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { employeeApi } from "@/entities/employee";
import { resolvePreferredEmployeeCounterpartyMapping } from "@/modules/employees/lib/employeeCounterpartyMapping";
import { formatPassportDepartmentCode } from "@/modules/employees/lib/employeeFormFormatters";
import { formatSnils } from "@/utils/formatters";
import dayjs from "dayjs";

const EMPTY_EMPLOYEES = [];
const DEFAULT_PAGE_SIZE = 100;
const TAB_ALL = "all";
const TAB_NOT_UPLOADED = "not_uploaded";

const formatDateValue = (value) =>
  value ? dayjs(value).format("DD.MM.YYYY") : "-";

const formatGender = (gender) => {
  if (!gender) return "-";
  return gender === "male" ? "М" : gender === "female" ? "Ж" : gender;
};

const formatPassportType = (passportType) => passportType || "-";

const getBirthCountryName = (employee) =>
  employee?.birthCountry?.code || employee?.citizenship?.code || "-";

const getEmployeeFromGetByIdResponse = (response) => {
  const payload = response?.data || response;
  return payload?.data || payload;
};

const hasValue = (value) => {
  if (value === undefined || value === null) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
};

const ExcelExportModal = ({
  visible,
  queryParams = {},
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [selectedEmployeesById, setSelectedEmployeesById] = useState({});
  const [checkRequiredFields, setCheckRequiredFields] = useState(true);
  const [selectedTab, setSelectedTab] = useState(TAB_NOT_UPLOADED);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [employees, setEmployees] = useState(EMPTY_EMPLOYEES);
  const [totalCount, setTotalCount] = useState(0);
  const autoSelectCurrentPageRef = useRef(false);
  const [tablePagination, setTablePagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const hasExternalFilters = useMemo(
    () =>
      [
        "dateFrom",
        "dateTo",
        "positionNames",
        "departmentNames",
        "counterpartyNames",
        "citizenshipNames",
        "statuses",
        "counterpartyIds",
        "constructionSiteNames",
        "constructionSiteId",
      ].some((key) => hasValue(queryParams?.[key])),
    [queryParams],
  );

  const segmentOptions = [
    { label: "Не выгруженные", value: TAB_NOT_UPLOADED },
    { label: "Все", value: TAB_ALL },
  ];

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchText(searchText.trim());
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const requestParams = useMemo(() => {
    const params = {
      ...queryParams,
      page: tablePagination.current,
      limit: tablePagination.pageSize,
    };

    delete params.uploadStates;
    delete params.statusCard;

    if (selectedTab === TAB_NOT_UPLOADED) {
      params.uploadStates = JSON.stringify(["not_uploaded"]);
    }

    if (checkRequiredFields) {
      params.statusCard = JSON.stringify(["completed"]);
    }

    if (debouncedSearchText) {
      params.search = debouncedSearchText;
    }

    return params;
  }, [
    checkRequiredFields,
    debouncedSearchText,
    queryParams,
    selectedTab,
    tablePagination,
  ]);

  const loadEmployeesPage = useCallback(async () => {
    setEmployeesLoading(true);

    try {
      const response = await employeeApi.getAll(requestParams);
      const rows = response?.data?.employees || [];
      const pagination = response?.data?.pagination || {};
      const nextTotalCount = Number(pagination.total || rows.length || 0);

      setEmployees(rows);
      setTotalCount(nextTotalCount);

      if (autoSelectCurrentPageRef.current) {
        const pageIds = rows.map((employee) => employee.id).filter(Boolean);
        const pageMap = rows.reduce((acc, employee) => {
          if (employee?.id) {
            acc[employee.id] = employee;
          }
          return acc;
        }, {});

        setSelectedEmployeeIds(pageIds);
        setSelectedEmployeesById(pageMap);
        autoSelectCurrentPageRef.current = false;
      } else {
        setSelectedEmployeesById((prev) => {
          const trackedIds = new Set(Object.keys(prev));
          if (trackedIds.size === 0) {
            return prev;
          }

          let changed = false;
          const next = { ...prev };
          rows.forEach((employee) => {
            if (employee?.id && trackedIds.has(employee.id)) {
              next[employee.id] = employee;
              changed = true;
            }
          });

          return changed ? next : prev;
        });
      }
    } catch (error) {
      console.error("Failed to load employees for export:", error);
      message.error("Не удалось загрузить сотрудников для выгрузки");
      setEmployees([]);
      setTotalCount(0);
    } finally {
      setEmployeesLoading(false);
    }
  }, [message, requestParams]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    loadEmployeesPage();
    return undefined;
  }, [visible, loadEmployeesPage]);

  const handleOpenChange = useCallback((open) => {
    if (open) {
      setEmployeesLoading(true);
      setCheckRequiredFields(!hasExternalFilters);
      setSelectedTab(TAB_NOT_UPLOADED);
      setTablePagination({ current: 1, pageSize: DEFAULT_PAGE_SIZE });
      setSearchText("");
      setDebouncedSearchText("");
      setSelectedEmployeeIds([]);
      setSelectedEmployeesById({});
      autoSelectCurrentPageRef.current = true;
    } else {
      setSelectedEmployeeIds([]);
      setSelectedEmployeesById({});
      autoSelectCurrentPageRef.current = false;
    }
  }, [hasExternalFilters]);

  const handleTabChange = (nextTab) => {
    setSelectedTab(nextTab);
    setTablePagination((prev) => ({ ...prev, current: 1 }));
    setSelectedEmployeeIds([]);
    setSelectedEmployeesById({});
    autoSelectCurrentPageRef.current = true;
  };

  const handleRequiredFieldsChange = (event) => {
    const nextValue = event.target.checked;
    setCheckRequiredFields(nextValue);
    setTablePagination((prev) => ({ ...prev, current: 1 }));
    setSelectedEmployeeIds([]);
    setSelectedEmployeesById({});
    autoSelectCurrentPageRef.current = true;
  };

  const handleSearchTextChange = (event) => {
    setSearchText(event.target.value);
    setTablePagination((prev) => ({ ...prev, current: 1 }));
    setSelectedEmployeeIds([]);
    setSelectedEmployeesById({});
    autoSelectCurrentPageRef.current = true;
  };

  const rowSelection = {
    selectedRowKeys: selectedEmployeeIds,
    preserveSelectedRowKeys: true,
    onChange: (selectedKeys) => {
      setSelectedEmployeeIds(selectedKeys);
      setSelectedEmployeesById((prev) => {
        const next = { ...prev };

        employees.forEach((employee) => {
          if (!employee?.id) {
            return;
          }

          if (selectedKeys.includes(employee.id)) {
            next[employee.id] = employee;
          } else {
            delete next[employee.id];
          }
        });

        Object.keys(next).forEach((employeeId) => {
          if (!selectedKeys.includes(employeeId)) {
            delete next[employeeId];
          }
        });

        return next;
      });
    },
  };

  const columns = useMemo(
    () => [
      {
        title: "№",
        render: (_, __, index) =>
          (tablePagination.current - 1) * tablePagination.pageSize + index + 1,
        width: 40,
        align: "center",
      },
      {
        title: "ФИО",
        render: (_, record) =>
          `${record.lastName} ${record.firstName} ${record.middleName || ""}`.trim(),
        key: "fullName",
        ellipsis: true,
      },
      {
        title: "Должность",
        dataIndex: ["position", "name"],
        key: "position",
        ellipsis: true,
      },
      {
        title: "Контрагент",
        render: (_, record) => {
          const preferredMapping = resolvePreferredEmployeeCounterpartyMapping(record);
          return preferredMapping?.counterparty?.name || "-";
        },
        key: "counterparty",
        ellipsis: true,
      },
      {
        title: "Гражданство",
        dataIndex: ["citizenship", "name"],
        key: "citizenship",
        ellipsis: true,
      },
      {
        title: "р/с",
        dataIndex: "bankAccountNumber",
        key: "bankAccountNumber",
        ellipsis: true,
        render: (value) => value || "-",
      },
    ],
    [tablePagination],
  );
  const hiddenColumnKeys = new Set(["position"]);
  const visibleColumns = columns.filter((column) => !hiddenColumnKeys.has(column.key));

  const selectedEmployees = useMemo(
    () =>
      selectedEmployeeIds
        .map((employeeId) => selectedEmployeesById[employeeId])
        .filter(Boolean),
    [selectedEmployeeIds, selectedEmployeesById],
  );

  const handleExport = async () => {
    if (selectedEmployeeIds.length === 0) {
      message.warning("Выберите хотя бы одного сотрудника для выгрузки");
      return;
    }

    try {
      setLoading(true);

      const missingEmployeeIds = selectedEmployeeIds.filter(
        (employeeId) => !selectedEmployeesById[employeeId],
      );

      let allSelectedEmployees = selectedEmployees;

      if (missingEmployeeIds.length > 0) {
        const missingEmployees = await Promise.all(
          missingEmployeeIds.map(async (employeeId) => {
            const response = await employeeApi.getById(employeeId);
            return getEmployeeFromGetByIdResponse(response);
          }),
        );

        const fetchedById = missingEmployees.reduce((acc, employee) => {
          if (employee?.id) {
            acc[employee.id] = employee;
          }
          return acc;
        }, {});

        setSelectedEmployeesById((prev) => ({
          ...prev,
          ...fetchedById,
        }));

        allSelectedEmployees = selectedEmployeeIds
          .map((employeeId) => selectedEmployeesById[employeeId] || fetchedById[employeeId])
          .filter(Boolean);
      }

      if (allSelectedEmployees.length === 0) {
        message.warning("Не удалось собрать данные выбранных сотрудников для выгрузки");
        return;
      }

      const XLSX = await import("xlsx");

      const excelData = allSelectedEmployees.map((employee) => {
        const counterpartyMapping = resolvePreferredEmployeeCounterpartyMapping(employee);

        return {
          UUID: employee.id || "-",
          Фамилия: employee.lastName || "-",
          Имя: employee.firstName || "-",
          Отчество: employee.middleName || "-",
          Пол: formatGender(employee.gender),
          Телефон: employee.phone || "-",
          "Дата рождения": formatDateValue(employee.birthDate),
          "Страна рождения": getBirthCountryName(employee),
          "Область рождения": employee.birthRegion || "-",
          "Населенный пункт рождения": employee.birthCity || "-",
          "Тип паспорта": formatPassportType(employee.passportType),
          "Номер паспорта": employee.passportNumber || "-",
          "Дата выдачи паспорта": formatDateValue(employee.passportDate),
          "Кем выдан паспорт": employee.passportIssuer || "-",
          "Код подразделения":
            formatPassportDepartmentCode(employee.passportDepartmentCode) || "-",
          "Адрес регистрации": employee.registrationAddress || "-",
          Патент: employee.patentNumber || "-",
          "Дата выдачи патента": formatDateValue(employee.patentIssueDate),
          "Номер бланка патента": employee.blankNumber || "-",
          ИНН: employee.inn || "-",
          СНИЛС: formatSnils(employee.snils),
          КИГ: employee.kig || "-",
          "Дата окончания КИГ": formatDateValue(employee.kigEndDate),
          Гражданство: employee.citizenship?.name || "-",
          Организация: counterpartyMapping?.counterparty?.name || "-",
          "ИНН организации": counterpartyMapping?.counterparty?.inn || "-",
          "р/с": employee.bankAccountNumber || "-",
          БИК: employee.bankBik || "-",
          id_all: employee.idAll || "-",
          "Дата окончания паспорта": formatDateValue(employee.passportExpiryDate),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Сотрудники");

      const fileName = `Выгрузка_сотрудников_${dayjs().format("DD-MM-YYYY_HH-mm")}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      message.success(`Файл успешно выгружен: ${fileName}`);
      onSuccess?.();
      onCancel();
    } catch (error) {
      console.error("Export error:", error);
      message.error("Ошибка при выгрузке в Excel");
    } finally {
      setLoading(false);
    }
  };

  const tableLoading = employeesLoading || loading;
  const showEmptyState = !tableLoading && employees.length === 0;

  return (
    <Modal
      title="Выгрузка сотрудников в Excel"
      open={visible}
      onCancel={onCancel}
      width="90vw"
      centered
      style={{ maxWidth: "95vw" }}
      styles={{
        body: {
          maxHeight: "78vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        },
      }}
      afterOpenChange={handleOpenChange}
      footer={
        <Space>
          <Button onClick={onCancel}>Отмена</Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={handleExport}
            loading={loading}
            disabled={selectedEmployeeIds.length === 0}
          >
            Выгрузить в Excel ({selectedEmployeeIds.length})
          </Button>
        </Space>
      }
    >
      <div
        style={{
          marginBottom: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          flex: 1,
        }}
      >
        <style>{`
          .excel-export-table-container {
            display: flex;
            flex-direction: column;
            min-height: 0;
            flex: 1;
          }
          .excel-export-table-container .ant-table-pagination {
            position: sticky;
            bottom: 0;
            z-index: 5;
            background: #fff;
            border-top: 1px solid #f0f0f0;
            margin: 0 !important;
            padding: 10px 12px !important;
          }
        `}</style>
        <div style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}>
          В текущем списке найдено: <strong>{totalCount}</strong>
        </div>
        <Input
          placeholder="Поиск по ФИО"
          value={searchText}
          onChange={handleSearchTextChange}
          allowClear
          style={{ marginBottom: "12px", maxWidth: 420 }}
        />
        <Segmented
          options={segmentOptions}
          value={selectedTab}
          onChange={handleTabChange}
          style={{
            marginBottom: "12px",
            width: "fit-content",
            alignSelf: "flex-start",
          }}
        />
        <div style={{ marginBottom: "12px" }}>
          <Checkbox
            checked={checkRequiredFields}
            onChange={handleRequiredFieldsChange}
          >
            Проверять обязательные поля
          </Checkbox>
        </div>

        {showEmptyState ? (
          <Empty
            description="Нет сотрудников для выгрузки"
            style={{ marginTop: "40px", marginBottom: "40px" }}
          />
        ) : (
          <div className="excel-export-table-container">
            <Table
              className="excel-export-table"
              rowSelection={rowSelection}
              columns={visibleColumns}
              dataSource={employees}
              rowKey="id"
              loading={tableLoading}
              size="small"
              pagination={{
                current: tablePagination.current,
                pageSize: tablePagination.pageSize,
                total: totalCount,
                showSizeChanger: true,
                pageSizeOptions: ["50", "100", "200"],
                showTotal: (total) => `Всего: ${total}`,
              onChange: (page, pageSize) => {
                setTablePagination({ current: page, pageSize });
                autoSelectCurrentPageRef.current = false;
              },
              onShowSizeChange: (_current, pageSize) => {
                setTablePagination({ current: 1, pageSize });
                autoSelectCurrentPageRef.current = false;
              },
            }}
              scroll={{ x: 1000, y: "calc(78vh - 280px)" }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ExcelExportModal;
