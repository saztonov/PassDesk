import { Alert, Button } from "antd";
import { WarningOutlined } from "@ant-design/icons";

const OcrConflictSummaryNotice = ({ summary, onOpen }) => {
  if (!summary?.hasConflicts) {
    return null;
  }

  return (
    <Alert
      type="warning"
      showIcon
      icon={<WarningOutlined />}
      style={{ marginBottom: 12 }}
      message={`Найдено расхождений: ${summary.conflictsCount}`}
      action={
        typeof onOpen === "function" ? (
          <Button size="small" type="primary" onClick={onOpen}>
            Открыть
          </Button>
        ) : null
      }
    />
  );
};

export default OcrConflictSummaryNotice;
