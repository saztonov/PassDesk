import { useCallback, useEffect, useState } from "react";
import { App, Button, Popconfirm, Space, Table, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import ocrService from "@/services/ocrService";

const { Text } = Typography;

const formatValue = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)?$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return normalized;
};

const EmployeeOcrConflictsCompact = ({ employee }) => {
  const { message } = App.useApp();
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const employeeId = employee?.id;

  const loadConflicts = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const res = await ocrService.getEmployeeConflictSummary(employeeId);
      const items = res?.data?.conflicts || res?.conflicts || [];
      setConflicts(items);
    } catch {
      // тихо
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [employeeId]);

  useEffect(() => {
    setHasLoaded(false);
    loadConflicts();
  }, [loadConflicts]);

  const handleResolve = async (conflictId) => {
    setActionLoadingId(conflictId);
    try {
      await ocrService.resolveConflict(conflictId);
      message.success("Конфликт закрыт");
      setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
    } catch {
      message.error("Не удалось закрыть конфликт");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApply = async (conflictId) => {
    setActionLoadingId(conflictId);
    try {
      await ocrService.applyConflict(conflictId);
      message.success("Значение применено");
      setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
    } catch {
      message.error("Не удалось применить значение");
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!employeeId || !hasLoaded || conflicts.length === 0) return null;

  const columns = [
    {
      title: "Поле",
      dataIndex: "fieldLabel",
      key: "fieldLabel",
      width: 140,
      render: (val) => <Text strong style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: "Значения",
      key: "values",
      render: (_, record) => {
        const sources = record.sources || [];
        const unique = [...new Set(sources.map((s) => formatValue(s.value)).filter(Boolean))];
        return (
          <Space size={4} wrap>
            {unique.map((val, i) => (
              <Tag key={i} style={{ fontSize: 11, margin: 0 }}>{val}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_, record) => {
        const isLoading = actionLoadingId === record.id;
        return (
          <Space size={4}>
            <Tooltip title="Применить значение из OCR">
              <Popconfirm
                title="Применить значение из документа?"
                onConfirm={() => handleApply(record.id)}
                okText="Применить"
                cancelText="Отмена"
              >
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<CheckOutlined />}
                  loading={isLoading}
                />
              </Popconfirm>
            </Tooltip>
            <Tooltip title="Закрыть конфликт (оставить текущее)">
              <Popconfirm
                title="Закрыть конфликт? Значение в карточке останется прежним."
                onConfirm={() => handleResolve(record.id)}
                okText="Закрыть"
                cancelText="Отмена"
              >
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  loading={isLoading}
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ marginBottom: 12, border: "1px solid #faad14", borderRadius: 6, padding: "8px 12px", background: "#fffbe6" }}>
      <Space style={{ marginBottom: 6 }} align="center">
        <WarningOutlined style={{ color: "#faad14" }} />
        <Text style={{ fontSize: 12, fontWeight: 600, color: "#ad6800" }}>
          Конфликты распознавания ({conflicts.length})
        </Text>
        <Button
          size="small"
          type="text"
          icon={<ReloadOutlined />}
          onClick={loadConflicts}
          loading={loading}
          style={{ padding: "0 4px", height: 20, fontSize: 11 }}
        />
      </Space>
      <Table
        dataSource={conflicts}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        loading={loading}
        showHeader={false}
        style={{ fontSize: 12 }}
      />
    </div>
  );
};

export default EmployeeOcrConflictsCompact;
