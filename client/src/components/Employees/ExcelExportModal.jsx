import { useCallback, useState, useMemo } from "react";
import { Modal, Table, Button, Space, App, Empty, Segmented } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { employeeApi } from "@/entities/employee";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

const EMPTY_EMPLOYEES = [];

/**
 * Модальное окно для выгрузки сотрудников в Excel.
 * Показывает ровно тот же список сотрудников, который виден на странице.
 */
const ExcelExportModal = ({
  visible,
  employees = EMPTY_EMPLOYEES,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [showMode, setShowMode] = useState("not_uploaded");

  const filteredEmployees = useMemo(() => {
    if (showMode === "all") return employees;
    return employees.filter((emp) => {
      const activeMappings = (emp.statusMappings || []).filter((m) => m.isActive);
      if (activeMappings.length === 0) return true;
      return activeMappings.some((m) => !m.isUpload);
    });
  }, [employees, showMode]);

  const handleOpenChange = useCallback(
    (open) => {
      if (open) {
        setShowMode("not_uploaded");
        const notUploaded = employees.filter((emp) => {
          const activeMappings = (emp.statusMappings || []).filter((m) => m.isActive);
          if (activeMappings.length === 0) return true;
          return activeMappings.some((m) => !m.isUpload);
        });
        setSelectedEmployeeIds(notUploaded.map((emp) => emp.id));
      } else {
        setSelectedEmployeeIds([]);
      }
    },
    [employees],
  );

  // Обработка экспорта в Excel
  const handleExport = async () => {
    if (selectedEmployeeIds.length === 0) {
      message.warning("Выберите хотя бы одного сотрудника для выгрузки");
      return;
    }

    try {
      setLoading(true);

      // Получаем выбранных сотрудников
      const employeesToExport = filteredEmployees.filter((emp) =>
        selectedEmployeeIds.includes(emp.id),
      );

      // Формируем данные для Excel
      const excelData = employeesToExport.map((emp) => {
        // Получаем основного контрагента (первый в списке)
        const counterpartyMapping = emp.employeeCounterpartyMappings?.[0];

        // Форматирование пола для экспорта
        const formatGender = (gender) => {
          if (!gender) return "-";
          return gender === "male" ? "М" : gender === "female" ? "Ж" : gender;
        };

        return {
          UUID: emp.id || "-",
          Фамилия: emp.lastName || "-",
          Имя: emp.firstName || "-",
          Отчество: emp.middleName || "-",
          Пол: formatGender(emp.gender),
          Телефон: emp.phone || "-",
          "Дата рождения": emp.birthDate
            ? dayjs(emp.birthDate).format("DD.MM.YYYY")
            : "-",
          "Страна рождения": emp.birthCountry?.code || "-",
          "Тип паспорта": emp.passportType || "-",
          "Номер паспорта": emp.passportNumber || "-",
          "Дата выдачи паспорта": emp.passportDate
            ? dayjs(emp.passportDate).format("DD.MM.YYYY")
            : "-",
          "Кем выдан паспорт": emp.passportIssuer || "-",
          "Адрес регистрации": emp.registrationAddress || "-",
          Патент: emp.patentNumber || "-",
          "Дата выдачи патента": emp.patentIssueDate
            ? dayjs(emp.patentIssueDate).format("DD.MM.YYYY")
            : "-",
          "Номер бланка патента": emp.blankNumber || "-",
          ИНН: emp.inn || "-",
          СНИЛС: emp.snils || "-",
          КИГ: emp.kig || "-",
          "Дата окончания КИГ": emp.kigEndDate
            ? dayjs(emp.kigEndDate).format("DD.MM.YYYY")
            : "-",
          Гражданство: emp.citizenship?.code || "-",
          Организация: counterpartyMapping?.counterparty?.name || "-",
          "ИНН организации": counterpartyMapping?.counterparty?.inn || "-",
          id_all: emp.idAll || "-",
          "Дата окончания паспорта": emp.passportExpiryDate
            ? dayjs(emp.passportExpiryDate).format("DD.MM.YYYY")
            : "-",
        };
      });

      // Создаем Excel файл
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Сотрудники");

      // Генерируем имя файла
      const fileName = `Выгрузка_сотрудников_${dayjs().format("DD-MM-YYYY_HH-mm")}.xlsx`;

      // Сохраняем файл
      XLSX.writeFile(workbook, fileName);

      // Обновляем is_upload = true для всех активных статусов выгруженных сотрудников
      await Promise.all(
        employeesToExport.map((emp) =>
          employeeApi.updateAllStatusesUploadFlag(emp.id, true),
        ),
      );

      message.success(`Файл успешно выгружен: ${fileName}`);
      onSuccess?.(employeesToExport.map((emp) => emp.id));
      onCancel();
    } catch (error) {
      console.error("Export error:", error);
      message.error("Ошибка при выгрузке в Excel");
    } finally {
      setLoading(false);
    }
  };

  // Столбцы таблицы для предпросмотра
  const columns = [
    {
      title: "№",
      render: (_, __, index) => index + 1,
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
  ];

  // Обработчик выбора строк
  const rowSelection = {
    selectedRowKeys: selectedEmployeeIds,
    onChange: (selectedKeys) => {
      setSelectedEmployeeIds(selectedKeys);
    },
  };

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
            disabled={selectedEmployeeIds.length === 0}
          >
            Выгрузить в Excel ({selectedEmployeeIds.length})
          </Button>
        </Space>
      }
    >
      {filteredEmployees.length === 0 ? (
        <Empty
          description="Нет сотрудников для выгрузки"
          style={{ marginTop: "40px", marginBottom: "40px" }}
        />
      ) : (
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{ marginBottom: "12px", color: "#666", fontSize: "14px" }}
          >
            В текущем списке найдено:{" "}
            <strong>{filteredEmployees.length}</strong>
          </div>
          <Segmented
            value={showMode}
            onChange={(val) => {
              setShowMode(val);
              setSelectedEmployeeIds([]);
            }}
            options={[
              { label: "Не выгруженные", value: "not_uploaded" },
              { label: "Все", value: "all" },
            ]}
            style={{ marginBottom: "12px" }}
          />
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={filteredEmployees}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
            scroll={{ x: 1000, y: 520 }}
          />
        </div>
      )}
    </Modal>
  );
};

export default ExcelExportModal;
