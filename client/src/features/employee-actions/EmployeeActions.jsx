import { Button, Space } from "antd";
import {
  PlusOutlined,
  FileExcelOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

/**
 * Feature: Действия над сотрудниками (добавление, заявка, импорт, блокировка)
 */
export const EmployeeActions = ({
  onAdd,
  onRequest,
  onImport,
  onSecurity,
  canExport,
  compact = false,
}) => {
  const { t } = useTranslation();

  return (
    <Space size={compact ? "small" : "middle"} wrap>
      <Button
        type="primary"
        icon={<FileExcelOutlined />}
        onClick={onRequest}
        size={compact ? "middle" : "middle"}
      >
        {t("employees.requestExcel")}
      </Button>
      <Button
        type="default"
        icon={<FileExcelOutlined />}
        onClick={onImport}
        size={compact ? "middle" : "middle"}
      >
        {t("employees.importExcel")}
      </Button>
      {canExport && (
        <Button
          type="default"
          icon={<LockOutlined />}
          onClick={onSecurity}
          size={compact ? "middle" : "middle"}
        >
          {t("employees.security")}
        </Button>
      )}
      <Button
        type="default"
        icon={<PlusOutlined />}
        onClick={onAdd}
        size={compact ? "middle" : "middle"}
      >
        {t("employees.addEmployee")}
      </Button>
    </Space>
  );
};
