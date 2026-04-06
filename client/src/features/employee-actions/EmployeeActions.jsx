import { Button, Space } from "antd";
import {
  PlusOutlined,
  FileExcelOutlined,
  LockOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const SHOW_REQUEST_EXCEL_ACTION = false;
const SHOW_SECURITY_ACTION = false;

/**
 * Feature: Действия над сотрудниками (добавление, заявка, импорт, блокировка)
 */
export const EmployeeActions = ({
  onAdd,
  onRequest,
  onImport,
  onExport,
  onSecurity,
  canExport,
  compact = false,
}) => {
  const { t } = useTranslation();

  return (
    <Space size={compact ? "small" : "middle"} wrap>
      {SHOW_REQUEST_EXCEL_ACTION ? (
        <Button
          type="primary"
          icon={<FileExcelOutlined />}
          onClick={onRequest}
          size={compact ? "middle" : "middle"}
        >
          {t("employees.requestExcel")}
        </Button>
      ) : null}
      <Button
        type="default"
        icon={<FileExcelOutlined />}
        onClick={onImport}
        size={compact ? "middle" : "middle"}
      >
        {t("employees.importExcel")}
      </Button>
      {canExport ? (
        <Button
          type="default"
          icon={<DownloadOutlined />}
          onClick={onExport}
          size={compact ? "middle" : "middle"}
        >
          {t("employees.exportExcel")}
        </Button>
      ) : null}
      {SHOW_SECURITY_ACTION && canExport ? (
        <Button
          type="default"
          icon={<LockOutlined />}
          onClick={onSecurity}
          size={compact ? "middle" : "middle"}
        >
          {t("employees.security")}
        </Button>
      ) : null}
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
