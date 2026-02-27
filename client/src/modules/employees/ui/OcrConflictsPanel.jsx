import { Alert, Button, List, Space, Tag, Typography } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  OCR_FIELD_LABELS,
  normalizeString,
} from "@/modules/employees/lib/employeeOcrUtils";

const { Text } = Typography;

const formatDisplayValue = (value) => {
  if (value === null || value === undefined) return "—";
  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value.format("DD.MM.YYYY") : "—";
  }
  const normalized = normalizeString(value);
  return normalized || "—";
};

const OcrConflictsPanel = ({
  conflicts = [],
  onKeep,
  onReplace,
  onKeepAll,
  onReplaceAll,
}) => {
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        message="Найдены расхождения между данными формы и OCR"
        description={
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <Button size="small" onClick={onKeepAll}>
                Оставить все текущие
              </Button>
              <Button size="small" type="primary" onClick={onReplaceAll}>
                Заменить все на OCR
              </Button>
            </Space>

            <List
              size="small"
              bordered
              dataSource={conflicts}
              renderItem={(item) => {
                const fieldLabel =
                  item.fieldLabel || OCR_FIELD_LABELS[item.fieldName] || item.fieldName;

                return (
                  <List.Item
                    actions={[
                      <Button
                        key="keep"
                        size="small"
                        onClick={() => onKeep?.(item.fieldName)}
                      >
                        Оставить
                      </Button>,
                      <Button
                        key="replace"
                        size="small"
                        type="primary"
                        onClick={() => onReplace?.(item.fieldName)}
                      >
                        Заменить
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <Space wrap>
                        <Text strong>{fieldLabel}</Text>
                        {item.fileDocumentType && (
                          <Tag>{item.fileDocumentType}</Tag>
                        )}
                      </Space>
                      <Text type="secondary">
                        Текущее: {formatDisplayValue(item.currentValue)}
                      </Text>
                      <Text>
                        OCR: {formatDisplayValue(item.ocrValue)}
                      </Text>
                    </Space>
                  </List.Item>
                );
              }}
            />
          </Space>
        }
      />
    </div>
  );
};

export default OcrConflictsPanel;
