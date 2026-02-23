import { Table } from "antd";
import dayjs from "dayjs";
import { useEffect, useCallback } from "react";
import { formatSnils, formatKig, formatInn } from "../../utils/formatters";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";

const BiometricTable = ({ employees, onExport }) => {
  const columns = [
    {
      title: "№",
      key: "number",
      width: 50,
      render: (_, __, index) => index + 1,
    },
    {
      title: "Ф.И.О.",
      key: "fullName",
      width: 200,
      render: (_, record) =>
        `${record.lastName} ${record.firstName} ${record.middleName || ""}`.trim(),
    },
    {
      title: "КИГ",
      dataIndex: "kig",
      key: "kig",
      width: 120,
      render: (value) => formatKig(value),
    },
    {
      title: "Гражданство",
      key: "citizenship",
      width: 150,
      render: (_, record) => record.citizenship?.name || "-",
    },
    {
      title: "Дата рождения",
      dataIndex: "birthDate",
      key: "birthDate",
      width: 120,
      render: (date) => (date ? dayjs(date).format("DD.MM.YYYY") : "-"),
    },
    {
      title: "СНИЛС",
      dataIndex: "snils",
      key: "snils",
      width: 150,
      render: (value) => formatSnils(value),
    },
    {
      title: "Должность",
      key: "position",
      width: 150,
      render: (_, record) => record.position?.name || "-",
    },
    {
      title: "ИНН сотрудника",
      dataIndex: "inn",
      key: "inn",
      width: 130,
      render: (value) => formatInn(value),
    },
    {
      title: "Согласие Биом.",
      key: "biometricConsent",
      width: 130,
      render: (_, record) => {
        const hasConsent = record.files && record.files.length > 0;
        return hasConsent ? (
          <span style={{ color: "#52c41a", fontSize: "16px" }}>
            <CheckOutlined /> Да
          </span>
        ) : (
          <span style={{ color: "#f5222d", fontSize: "16px" }}>
            <CloseOutlined /> Нет
          </span>
        );
      },
    },
  ];

  // Функция экспорта в Excel (временно отключена)
  const exportToExcel = useCallback(() => {
    console.log("Excel export will be implemented later");
    // TODO: Implement Excel export after fixing xlsx dependency
  }, []);

  // Передаем функцию экспорта наружу через useEffect
  useEffect(() => {
    if (onExport && typeof onExport === "function") {
      onExport(exportToExcel);
    }
  }, [onExport, exportToExcel]);

  return (
    <Table
      columns={columns}
      dataSource={employees}
      rowKey="id"
      pagination={false}
      scroll={{ x: 1350 }}
      bordered
      size="small"
    />
  );
};

export default BiometricTable;
