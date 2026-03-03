import { Alert, Space, Tag, Typography } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { DEFAULT_DOCUMENT_TYPES } from "@/modules/employees/lib/documentTypeUploaderUtils";

const { Text } = Typography;

const DOCUMENT_LABELS = DEFAULT_DOCUMENT_TYPES.reduce((accumulator, item) => {
  accumulator[item.value] = item.label;
  return accumulator;
}, {});

const getDocumentLabel = (documentType) =>
  DOCUMENT_LABELS[documentType] || documentType || "Документ";

const OcrConflictSummaryNotice = ({ summary }) => {
  if (!summary?.hasConflicts) {
    return null;
  }

  const documents = Array.isArray(summary.documents) ? summary.documents : [];
  const detectedAt = summary.lastDetectedAt
    ? dayjs(summary.lastDetectedAt).format("DD.MM.YYYY HH:mm")
    : null;

  return (
    <Alert
      type="warning"
      showIcon
      icon={<WarningOutlined />}
      style={{ marginBottom: 12 }}
      message="Найдены расхождения в документах"
      description={
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <Space wrap size={[6, 6]}>
            {documents.map((item) => (
              <Tag key={item.documentType} color="gold">
                {getDocumentLabel(item.documentType)}
              </Tag>
            ))}
          </Space>
          <Text type="secondary">
            Расхождений: {summary.conflictsCount}
            {detectedAt ? `, последнее: ${detectedAt}` : ""}
          </Text>
        </Space>
      }
    />
  );
};

export default OcrConflictSummaryNotice;
