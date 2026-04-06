import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import { employeeService } from "@/services/employeeService";
import ocrService from "@/services/ocrService";
import {
  normalizeString,
  resolveOcrDocumentTypeByFile,
} from "@/modules/employees/lib/employeeOcrUtils";

const { Paragraph, Text } = Typography;

const toEmployeeList = (response) => response?.data?.employees || [];
const toFiles = (response) => response?.data || [];
const toOcrResponseData = (response) => response?.data || response || {};
const toNormalized = (responseData) =>
  responseData?.normalized || responseData?.data?.normalized || null;
const toProvider = (responseData) =>
  normalizeString(responseData?.provider || responseData?.data?.provider) ||
  "openrouter";

const resolveEmployeeName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim() || employee?.fullName || employee?.id;

const resolveEmployeePassportType = (employee) =>
  normalizeString(employee?.passportType || employee?.passport_type).toLowerCase() ||
  "russian";

const formatBytes = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const stringifyShort = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || "");
  }
};

const ExistingEmployeeOcrLab = () => {
  const { message } = App.useApp();
  const [searchText, setSearchText] = useState("");
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [runningMap, setRunningMap] = useState({});
  const [resultMap, setResultMap] = useState({});
  const [saveResults, setSaveResults] = useState(true);

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const response = await employeeService.getAll({
        page: 1,
        limit: 50,
        activeOnly: false,
        ...(normalizeString(searchText) ? { search: normalizeString(searchText) } : {}),
      });
      const nextEmployees = Array.isArray(toEmployeeList(response))
        ? toEmployeeList(response)
        : [];
      setEmployees(nextEmployees);
      setSelectedEmployeeIds([]);
      setFiles([]);
      setResultMap({});
    } catch (error) {
      console.error("Failed to load employees:", error);
      message.error("Не удалось загрузить сотрудников");
    } finally {
      setEmployeesLoading(false);
    }
  };

  const loadFiles = async () => {
    if (selectedEmployeeIds.length === 0) {
      message.warning("Сначала выберите сотрудников");
      return;
    }

    setFilesLoading(true);
    try {
      const selectedEmployees = employees.filter((employee) =>
        selectedEmployeeIds.includes(employee.id),
      );

      const responses = await Promise.all(
        selectedEmployees.map(async (employee) => {
          const response = await employeeService.getFiles(employee.id, {
            force: true,
          });
          const employeeFiles = Array.isArray(toFiles(response)) ? toFiles(response) : [];
          const passportType = resolveEmployeePassportType(employee);
          return employeeFiles.map((file) => ({
            ...file,
            employeeId: employee.id,
            employeeName: resolveEmployeeName(employee),
            employeePassportType: passportType,
            ocrDocumentType: resolveOcrDocumentTypeByFile(
              file.documentType,
              passportType,
            ),
          }));
        }),
      );

      const nextFiles = responses.flat();
      setFiles(nextFiles);
      setResultMap({});
      message.success(`Загружено файлов: ${nextFiles.length}`);
    } catch (error) {
      console.error("Failed to load employee files:", error);
      message.error("Не удалось загрузить документы сотрудников");
    } finally {
      setFilesLoading(false);
    }
  };

  const openFile = async (record) => {
    try {
      const response = await employeeService.getFileViewLink(
        record.employeeId,
        record.id,
      );
      const viewUrl = response?.data?.viewUrl;
      if (viewUrl) {
        window.open(viewUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Failed to open employee file:", error);
      message.error("Не удалось открыть файл");
    }
  };

  const runOcrForFile = async (record) => {
    if (!record?.ocrDocumentType) {
      message.warning("Для этого типа документа OCR не настроен");
      return;
    }

    setRunningMap((prev) => ({ ...prev, [record.id]: true }));
    setResultMap((prev) => ({
      ...prev,
      [record.id]: {
        status: "processing",
      },
    }));

    try {
      const response = await ocrService.recognizeDocument({
        fileId: record.id,
        employeeId: record.employeeId,
        documentType: record.ocrDocumentType,
      });

      const responseData = toOcrResponseData(response);
      const normalized = toNormalized(responseData);

      if (!normalized || typeof normalized !== "object") {
        setResultMap((prev) => ({
          ...prev,
          [record.id]: {
            status: "warning",
            message: "OCR не вернул распознанные поля",
            data: null,
          },
        }));
        return;
      }

      if (saveResults) {
        await ocrService.confirmFileOcr({
          fileId: record.id,
          provider: toProvider(responseData),
          result: {
            documentType: record.ocrDocumentType,
            normalized,
          },
          conflicts: [],
        });
      }

      setResultMap((prev) => ({
        ...prev,
        [record.id]: {
          status: "success",
          message: saveResults
            ? "OCR выполнен и сохранен"
            : "OCR выполнен без сохранения",
          data: normalized,
        },
      }));
    } catch (error) {
      console.error("OCR run failed:", error);
      setResultMap((prev) => ({
        ...prev,
        [record.id]: {
          status: "error",
          message:
            error?.response?.data?.message || error?.message || "Ошибка OCR",
          data: null,
        },
      }));
    } finally {
      setRunningMap((prev) => {
        const next = { ...prev };
        delete next[record.id];
        return next;
      });
    }
  };

  const runBatch = async () => {
    const supportedFiles = files.filter((file) => file.ocrDocumentType);
    if (supportedFiles.length === 0) {
      message.warning("Нет документов с поддержкой OCR");
      return;
    }

    for (const file of supportedFiles) {
      await runOcrForFile(file);
    }

    message.success(`OCR завершен: ${supportedFiles.length} файлов`);
  };

  const stats = useMemo(() => {
    const supported = files.filter((file) => file.ocrDocumentType).length;
    const processed = Object.keys(resultMap).length;
    const success = Object.values(resultMap).filter(
      (item) => item?.status === "success",
    ).length;
    const errors = Object.values(resultMap).filter(
      (item) => item?.status === "error",
    ).length;

    return {
      total: files.length,
      supported,
      processed,
      success,
      errors,
    };
  }, [files, resultMap]);

  const employeeColumns = [
    {
      title: "Сотрудник",
      dataIndex: "lastName",
      key: "employee",
      render: (_, record) => resolveEmployeeName(record),
    },
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 260,
      render: (value) => <Text code>{value}</Text>,
    },
  ];

  const fileColumns = [
    {
      title: "Сотрудник",
      dataIndex: "employeeName",
      key: "employeeName",
      width: 220,
    },
    {
      title: "Документ",
      key: "document",
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.originalName || record.fileName}</Text>
          <Space size={6} wrap>
            <Tag>{record.documentType || "without-type"}</Tag>
            {record.ocrDocumentType ? (
              <Tag color="blue">{record.ocrDocumentType}</Tag>
            ) : (
              <Tag color="default">ocr unsupported</Tag>
            )}
          </Space>
        </Space>
      ),
    },
    {
      title: "Размер",
      dataIndex: "fileSize",
      key: "fileSize",
      width: 110,
      render: (value) => formatBytes(value),
    },
    {
      title: "Статус",
      key: "status",
      width: 180,
      render: (_, record) => {
        if (runningMap[record.id]) {
          return <Tag color="processing">processing</Tag>;
        }

        const result = resultMap[record.id];
        if (!result) {
          return <Tag>idle</Tag>;
        }

        if (result.status === "success") {
          return <Tag color="success">success</Tag>;
        }
        if (result.status === "warning") {
          return <Tag color="warning">warning</Tag>;
        }
        if (result.status === "error") {
          return <Tag color="error">error</Tag>;
        }
        return <Tag color="processing">processing</Tag>;
      },
    },
    {
      title: "Результат",
      key: "result",
      render: (_, record) => {
        const result = resultMap[record.id];
        if (!result) {
          return <Text type="secondary">OCR ещё не запускался</Text>;
        }

        return (
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            <Text>{result.message}</Text>
            {result.data ? (
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 12,
                  maxWidth: 520,
                }}
              >
                {stringifyShort(result.data)}
              </pre>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: "Действия",
      key: "actions",
      width: 180,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openFile(record)}
          >
            Открыть
          </Button>
          <Button
            size="small"
            type="primary"
            loading={Boolean(runningMap[record.id])}
            disabled={!record.ocrDocumentType}
            onClick={() => runOcrForFile(record)}
          >
            OCR
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="warning"
        showIcon
        message="Временная страница"
        description="Инструмент для запуска OCR по уже загруженным документам сотрудников. Использует существующие fileId и может сохранять OCR metadata обратно в систему."
      />

      <Card>
        <Space wrap>
          <Input
            placeholder="Поиск по сотрудникам"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onPressEnter={loadEmployees}
            style={{ width: 320 }}
          />
          <Button
            type="primary"
            loading={employeesLoading}
            onClick={loadEmployees}
          >
            Найти сотрудников
          </Button>
          <Checkbox
            checked={saveResults}
            onChange={(event) => setSaveResults(event.target.checked)}
          >
            Сохранять OCR result
          </Checkbox>
        </Space>
      </Card>

      <Card
        title="Сотрудники"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={filesLoading}
            onClick={loadFiles}
            disabled={selectedEmployeeIds.length === 0}
          >
            Загрузить документы выбранных
          </Button>
        }
      >
        <Table
          rowKey="id"
          size="small"
          columns={employeeColumns}
          dataSource={employees}
          loading={employeesLoading}
          pagination={{ pageSize: 100 }}
          rowSelection={{
            selectedRowKeys: selectedEmployeeIds,
            onChange: (keys) => setSelectedEmployeeIds(keys),
          }}
        />
      </Card>

      <Card
        title="Документы"
        extra={
          <Space size={12}>
            <Text type="secondary">
              Всего: {stats.total}, OCR: {stats.supported}, Успех: {stats.success},
              Ошибки: {stats.errors}
            </Text>
            <Button
              type="primary"
              onClick={runBatch}
              disabled={filesLoading || stats.supported === 0}
            >
              Запустить OCR по всем поддерживаемым
            </Button>
          </Space>
        }
      >
        {files.length === 0 ? (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Сначала найдите сотрудников и загрузите их документы.
          </Paragraph>
        ) : (
          <Table
            rowKey="id"
            size="small"
            columns={fileColumns}
            dataSource={files}
            loading={filesLoading}
            pagination={{
              pageSize: 100,
              showSizeChanger: true,
              pageSizeOptions: ["50", "100", "200"],
            }}
            scroll={{ x: 1400 }}
          />
        )}
      </Card>
    </Space>
  );
};

export default ExistingEmployeeOcrLab;
