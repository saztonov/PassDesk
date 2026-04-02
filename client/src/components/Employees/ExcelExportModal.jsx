import { useCallback, useState, useMemo, useEffect } from "react";
import { Modal, Table, Button, Space, App, Empty, Checkbox, Segmented } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { employeeApi } from "@/entities/employee";
import { formatPassportDepartmentCode } from "@/modules/employees/lib/employeeFormFormatters";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

const EMPTY_EMPLOYEES = [];
const DEFAULT_PAGE_SIZE = 20;
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

const ExcelExportModal = ({
  visible,
  queryParams = {},
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [checkRequiredFields, setCheckRequiredFields] = useState(true);
  const [selectedTab, setSelectedTab] = useState(TAB_NOT_UPLOADED);
  const [allEmployees, setAllEmployees] = useState(EMPTY_EMPLOYEES);
  const [tablePagination, setTablePagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const isEmployeeUploaded = useCallback((employee) => {
    const activeMappings = (employee?.statusMappings || []).filter(
      (mapping) => mapping?.isActive !== false,
    );

    if (activeMappings.length === 0) {
      return false;
    }

    return activeMappings.every((mapping) => Boolean(mapping?.isUpload));
  }, []);

  const applyCurrentSelection = useCallback(
    (employees, tab, shouldCheckRequired) => {
      const tabFiltered =
        tab === TAB_NOT_UPLOADED
          ? employees.filter((employee) => !isEmployeeUploaded(employee))
          : employees;
      const nextFiltered = shouldCheckRequired
        ? tabFiltered.filter((employee) => employee.statusCard === "completed")
        : tabFiltered;

      setSelectedEmployeeIds(nextFiltered.map((employee) => employee.id));
    },
    [isEmployeeUploaded],
  );

  const fetchAllEmployees = useCallback(async () => {
    const limit = 500;
    let page = 1;
    let totalPages = 1;
    const loadedEmployees = [];

    while (page <= totalPages) {
      const response = await employeeApi.getAll({
        ...queryParams,
        page,
        limit,
      });
      const employeesPage = response?.data?.employees || [];
      const pagination = response?.data?.pagination || {};

      loadedEmployees.push(...employeesPage);
      totalPages = pagination.pages || 1;
      page += 1;

      if (employeesPage.length === 0) {
        break;
      }
    }

    return loadedEmployees;
  }, [queryParams]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    let isCancelled = false;
    setEmployeesLoading(true);

    fetchAllEmployees()
      .then((employees) => {
        if (isCancelled) {
          return;
        }
        setAllEmployees(employees);
        applyCurrentSelection(employees, TAB_NOT_UPLOADED, true);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        console.error("Failed to load employees for export:", error);
        message.error("Не удалось загрузить сотрудников для выгрузки");
        setAllEmployees([]);
        setSelectedEmployeeIds([]);
      })
      .finally(() => {
        if (!isCancelled) {
          setEmployeesLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [visible, fetchAllEmployees, applyCurrentSelection, message]);

  const handleOpenChange = useCallback((open) => {
    if (open) {
      setCheckRequiredFields(true);
      setSelectedTab(TAB_NOT_UPLOADED);
      setTablePagination({ current: 1, pageSize: DEFAULT_PAGE_SIZE });
      setSelectedEmployeeIds([]);
    } else {
      setAllEmployees([]);
      setSelectedEmployeeIds([]);
    }
  }, []);

  const employeesByTab = useMemo(() => {
    if (selectedTab === TAB_NOT_UPLOADED) {
      return allEmployees.filter((employee) => !isEmployeeUploaded(employee));
    }
    return allEmployees;
  }, [allEmployees, isEmployeeUploaded, selectedTab]);

  const filteredEmployees = useMemo(() => {
    if (!checkRequiredFields) {
      return employeesByTab;
    }

    return employeesByTab.filter((employee) => employee.statusCard === "completed");
  }, [checkRequiredFields, employeesByTab]);

  const handleTabChange = (nextTab) => {
    setSelectedTab(nextTab);
    setTablePagination((prev) => ({ ...prev, current: 1 }));
    applyCurrentSelection(allEmployees, nextTab, checkRequiredFields);
  };

  const handleRequiredFieldsChange = (event) => {
    const nextValue = event.target.checked;
    setCheckRequiredFields(nextValue);
    setTablePagination((prev) => ({ ...prev, current: 1 }));
    applyCurrentSelection(allEmployees, selectedTab, nextValue);
  };

  const rowSelection = {
    selectedRowKeys: selectedEmployeeIds,
    preserveSelectedRowKeys: true,
    onChange: (selectedKeys) => {
      setSelectedEmployeeIds(selectedKeys);
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
          const mappings = record.employeeCounterpartyMappings || [];
          if (mappings.length === 0) return "-";
          const counterparties = [
            ...new Set(mappings.map((m) => m.counterparty?.name).filter(Boolean)),
          ];
          return counterparties.join(", ") || "-";
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

  const filteredEmployeesMap = useMemo(
    () => new Map(filteredEmployees.map((employee) => [employee.id, employee])),
    [filteredEmployees],
  );

  const selectedEmployees = useMemo(
    () =>
      selectedEmployeeIds
        .map((employeeId) => filteredEmployeesMap.get(employeeId))
        .filter(Boolean),
    [filteredEmployeesMap, selectedEmployeeIds],
  );

  const handleExport = async () => {
    if (selectedEmployees.length === 0) {
      message.warning("Выберите хотя бы одного сотрудника для выгрузки");
      return;
    }

    try {
      setLoading(true);

      const excelData = selectedEmployees.map((emp) => {
        const counterpartyMapping = emp.employeeCounterpartyMappings?.[0];

        return {
          UUID: emp.id || "-",
          Фамилия: emp.lastName || "-",
          Имя: emp.firstName || "-",
          Отчество: emp.middleName || "-",
          Пол: formatGender(emp.gender),
          Телефон: emp.phone || "-",
          "Дата рождения": formatDateValue(emp.birthDate),
          "Страна рождения": getBirthCountryName(emp),
          "Область рождения": emp.birthRegion || "-",
          "Населенный пункт рождения": emp.birthCity || "-",
          "Тип паспорта": formatPassportType(emp.passportType),
          "Номер паспорта": emp.passportNumber || "-",
          "Дата выдачи паспорта": formatDateValue(emp.passportDate),
          "Кем выдан паспорт": emp.passportIssuer || "-",
          "Код подразделения": formatPassportDepartmentCode(
            emp.passportDepartmentCode,
          ) || "-",
          "Адрес регистрации": emp.registrationAddress || "-",
          Патент: emp.patentNumber || "-",
          "Дата выдачи патента": formatDateValue(emp.patentIssueDate),
          "Номер бланка патента": emp.blankNumber || "-",
          ИНН: emp.inn || "-",
          СНИЛС: emp.snils || "-",
          КИГ: emp.kig || "-",
          "Дата окончания КИГ": formatDateValue(emp.kigEndDate),
          Гражданство: emp.citizenship?.name || "-",
          Организация: counterpartyMapping?.counterparty?.name || "-",
          "ИНН организации": counterpartyMapping?.counterparty?.inn || "-",
          "р/с": emp.bankAccountNumber || "-",
          БИК: emp.bankBik || "-",
          id_all: emp.idAll || "-",
          "Дата окончания паспорта": formatDateValue(emp.passportExpiryDate),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Сотрудники");

      const fileName = `Выгрузка_сотрудников_${dayjs().format("DD-MM-YYYY_HH-mm")}.xlsx`;

      XLSX.writeFile(workbook, fileName);

      // Временно отключено по требованию:
      // в Администрирование / Выгрузка НЕ делаем авто-отметку выгрузки (ЗУП).
      //
      // Старое поведение:
      // await Promise.all(
      //   employeesToExport.map((emp) =>
      //     employeeApi.updateAllStatusesUploadFlag(emp.id, true),
      //   ),
      // );

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

  const segmentOptions = [
    { label: "Не выгруженные", value: TAB_NOT_UPLOADED },
    { label: "Все", value: TAB_ALL },
  ];

  return (
    <Modal
      title="Выгрузка сотрудников в Excel"
      open={visible}
      onCancel={onCancel}
      width="90vw"
      style={{ maxWidth: "95vw" }}
      afterOpenChange={handleOpenChange}
      footer={
        <Space>
          <Button onClick={onCancel}>Отмена</Button>
          <Button
            type="primary"
            icon={<FileExcelOutlined />}
            onClick={handleExport}
            loading={loading}
            disabled={selectedEmployees.length === 0}
          >
            Выгрузить в Excel ({selectedEmployees.length})
          </Button>
        </Space>
      }
    >
      {filteredEmployees.length === 0 ? (
        <Empty
          description={
            employeesLoading
              ? "Загрузка сотрудников..."
              : "Нет сотрудников для выгрузки"
          }
          style={{ marginTop: "40px", marginBottom: "40px" }}
        />
      ) : (
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}
          >
            В текущем списке найдено: <strong>{filteredEmployees.length}</strong>
          </div>
          <Segmented
            options={segmentOptions}
            value={selectedTab}
            onChange={handleTabChange}
            style={{ marginBottom: "12px" }}
          />
          <div style={{ marginBottom: "12px" }}>
            <Checkbox
              checked={checkRequiredFields}
              onChange={handleRequiredFieldsChange}
            >
              Проверять обязательные поля
            </Checkbox>
          </div>
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={filteredEmployees}
            rowKey="id"
            loading={employeesLoading || loading}
            size="small"
            pagination={{
              current: tablePagination.current,
              pageSize: tablePagination.pageSize,
              total: filteredEmployees.length,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50", "100"],
              showTotal: (total) => `Всего: ${total}`,
              onChange: (page, pageSize) => {
                setTablePagination({ current: page, pageSize });
              },
              onShowSizeChange: (_current, pageSize) => {
                setTablePagination({ current: 1, pageSize });
              },
            }}
            scroll={{ x: 1000, y: 520 }}
          />
        </div>
      )}
    </Modal>
  );
};

export default ExcelExportModal;
