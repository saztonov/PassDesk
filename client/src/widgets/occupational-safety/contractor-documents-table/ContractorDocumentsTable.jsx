import { useMemo, useState, useCallback } from "react";
import {
  Table,
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
  Dropdown,
  Popover,
  Tooltip as AntTooltip,
} from "antd";
import {
  DownloadOutlined,
  UploadOutlined,
  MessageOutlined,
  CheckOutlined,
  CloseOutlined,
  MoreOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  DeleteOutlined,
  RightOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { FileViewer } from "@/shared/ui/FileViewer/FileViewer";

const { Text } = Typography;

const statusIcons = {
  approved: <CheckCircleOutlined style={{ color: "#23a559" }} />,
  rejected: <CloseCircleOutlined style={{ color: "#d84e53" }} />,
  uploaded: <QuestionCircleOutlined style={{ color: "#2d6cdf" }} />,
  not_uploaded: <QuestionCircleOutlined style={{ color: "#be7a12" }} />,
};

const statusText = {
  not_uploaded: "Не загружен",
  uploaded: "Загружен",
  approved: "Подтвержден",
  rejected: "Отклонен",
};

const normalizeText = (value) => String(value || "").trim();

const getLevelIndent = (depth) => Math.max(0, Math.min(depth || 0, 6)) * 20;

const ContractorDocumentsTable = ({
  contractorTree,
  isStaff,
  isContractorUser,
  collapseSingleDocumentSubgroups = true,
  uploadingDocId,
  onDownloadTemplate,
  onDownloadContractorFile,
  onPreviewContractorFile,
  onDeleteContractorFile,
  onOpenDocumentComments,
  onUploadClick,
  onApprove,
  onReject,
}) => {
  const [collapsedCategoryKeys, setCollapsedCategoryKeys] = useState([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);

  const tableData = useMemo(() => {
    const mapNode = (node, parentPath = [], depth = 0) => {
      if (!node) return [];

      if (node.type === "document") {
        return [
          {
            ...node,
            depth,
            sectionLabel: parentPath.join(" / "),
          },
        ];
      }

      if (node.type === "category") {
        const children = node.children || [];
        const childCategories = children.filter(
          (child) => child?.type === "category",
        );
        const childDocuments = children.filter(
          (child) => child?.type === "document",
        );
        const replaceSingleDocumentWithCategoryRow =
          collapseSingleDocumentSubgroups &&
          depth > 0 &&
          childCategories.length === 0 &&
          childDocuments.length === 1;

        const nextPath = [...parentPath, node.name];
        if (replaceSingleDocumentWithCategoryRow) {
          const [singleDocument] = mapNode(
            childDocuments[0],
            nextPath,
            depth + 1,
          );
          return {
            ...node,
            depth,
            sectionLabel: nextPath.join(" / "),
            children: [],
            singleDocument: singleDocument || null,
          };
        }

        return {
          ...node,
          depth,
          sectionLabel: nextPath.join(" / "),
          children: children.flatMap((child) =>
            mapNode(child, nextPath, depth + 1),
          ),
        };
      }

      return [];
    };

    return (contractorTree || []).flatMap((node) => mapNode(node, [], 0));
  }, [contractorTree, collapseSingleDocumentSubgroups]);

  const allCategoryKeys = useMemo(() => {
    const keys = [];
    const walk = (nodes) => {
      (nodes || []).forEach((node) => {
        if (node?.type !== "category") return;
        if ((node.children || []).length > 0) {
          keys.push(node.key);
        }
        walk(node.children || []);
      });
    };
    walk(tableData);
    return keys;
  }, [tableData]);

  const expandedRowKeys = useMemo(() => {
    const collapsedSet = new Set(collapsedCategoryKeys);
    return allCategoryKeys.filter((key) => !collapsedSet.has(key));
  }, [allCategoryKeys, collapsedCategoryKeys]);

  const toggleCategoryExpand = useCallback((categoryKey) => {
    setCollapsedCategoryKeys((prev) =>
      prev.includes(categoryKey)
        ? prev.filter((key) => key !== categoryKey)
        : [...prev, categoryKey],
    );
  }, []);

  const handleExpandedRowsChange = useCallback(
    (nextExpandedRowKeys) => {
      const nextExpandedSet = new Set(nextExpandedRowKeys);
      setCollapsedCategoryKeys(
        allCategoryKeys.filter((key) => !nextExpandedSet.has(key)),
      );
    },
    [allCategoryKeys],
  );

  const handleExpandAll = useCallback(() => {
    setCollapsedCategoryKeys([]);
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapsedCategoryKeys(allCategoryKeys);
  }, [allCategoryKeys]);

  const getDocumentPayload = (record) =>
    record?.type === "document" ? record : record?.singleDocument || null;

  const hasExpandableChildren = (record) =>
    record?.type === "category" && (record.children || []).length > 0;

  const columns = [
    {
      title: "Позиция",
      key: "item",
      width: 460,
      render: (_, record) => {
        if (record.type === "category") {
          const isExpandable = hasExpandableChildren(record);
          const isExpanded = expandedRowKeys.includes(record.key);
          const levelIndent = getLevelIndent(record.depth);

          return (
            <div style={{ paddingLeft: levelIndent }}>
              <Space
                size={8}
                className={isExpandable ? "ot-row-clickable" : ""}
                onClick={
                  isExpandable
                    ? () => toggleCategoryExpand(record.key)
                    : undefined
                }
                onKeyDown={
                  isExpandable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleCategoryExpand(record.key);
                        }
                      }
                    : undefined
                }
                title={
                  isExpandable ? "Нажмите, чтобы раскрыть/свернуть" : undefined
                }
                role={isExpandable ? "button" : undefined}
                tabIndex={isExpandable ? 0 : undefined}
              >
                {isExpandable ? (
                  <RightOutlined
                    style={{
                      fontSize: 11,
                      color: "#5f728b",
                      transition: "transform 0.2s ease",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                ) : (
                  <span style={{ width: 11 }} />
                )}
                <FolderOpenOutlined style={{ color: "#2f5fba" }} />
                <Text strong className="ot-row-category-title">
                  {record.name}
                </Text>
                {record.description && (
                  <Tooltip title={record.description}>
                    <InfoCircleOutlined style={{ color: "#5f728b" }} />
                  </Tooltip>
                )}
              </Space>
            </div>
          );
        }

        const showSectionPath =
          record.depth > 2 &&
          typeof record.sectionLabel === "string" &&
          record.sectionLabel.includes(" / ");
        const levelIndent = getLevelIndent(record.depth);

        return (
          <div style={{ paddingLeft: levelIndent }}>
            <Space direction="vertical" size={2}>
              {showSectionPath && (
                <Text className="ot-row-path">{record.sectionLabel}</Text>
              )}
              <Space size={6}>
                <FileTextOutlined style={{ color: "#5f728b" }} />
                <Text className="ot-row-document-title">{record.name}</Text>
                {record.description && (
                  <Tooltip title={record.description}>
                    <InfoCircleOutlined style={{ color: "#8a98ac" }} />
                  </Tooltip>
                )}
              </Space>
            </Space>
          </div>
        );
      },
    },
    {
      title: "Файлы",
      key: "files",
      width: 260,
      render: (_, record) => {
        const docRecord = getDocumentPayload(record);
        if (!docRecord) {
          return (
            <Space size={6} wrap>
              <Tag bordered={false} className="ot-tag-soft">
                Категория
              </Tag>
              {isStaff && (
                <Button
                  size="small"
                  icon={<UploadOutlined />}
                  loading={uploadingDocId === record.id}
                  onClick={() => onUploadClick(record)}
                >
                  Загрузить
                </Button>
              )}
            </Space>
          );
        }

        const fileList = docRecord.files || [];

        return (
          <Space size={6} wrap>
            {docRecord.templateFileId && (
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => onDownloadTemplate(docRecord)}
              >
                Бланк
              </Button>
            )}
            {(isContractorUser || isStaff) && (
              <Button
                size="small"
                icon={<UploadOutlined />}
                loading={uploadingDocId === docRecord.id}
                onClick={() => onUploadClick(docRecord)}
              >
                Загрузить
              </Button>
            )}
            {docRecord.fileCount > 0 ? (
              <Popover
                trigger="click"
                title={`Файлы (${fileList.length})`}
                content={
                  <Space
                    direction="vertical"
                    size={4}
                    style={{ minWidth: 300 }}
                  >
                    {fileList.map((file) => (
                      <Space
                        key={file.id}
                        size={8}
                        style={{
                          width: "100%",
                          justifyContent: "space-between",
                        }}
                      >
                        <Button
                          type="link"
                          size="small"
                          style={{ paddingInline: 0 }}
                          onClick={() =>
                            onDownloadContractorFile(docRecord, file.id)
                          }
                        >
                          {file.name}
                        </Button>
                        <Space size={2}>
                          <Tooltip title="Предпросмотр">
                            <Button
                              size="small"
                              type="text"
                              icon={<EyeOutlined />}
                              onClick={async () => {
                                const previewData =
                                  await onPreviewContractorFile(
                                    docRecord,
                                    file.id,
                                  );
                                if (!previewData?.viewUrl) return;
                                setViewingFile({
                                  url: previewData.viewUrl,
                                  name: previewData.fileName || file.name,
                                  mimeType: previewData.mimeType || "",
                                  fileId: file.id,
                                  record: docRecord,
                                });
                                setViewerVisible(true);
                              }}
                            />
                          </Tooltip>
                          {(isContractorUser || isStaff) && (
                            <Tooltip title="Удалить файл">
                              <Button
                                size="small"
                                danger
                                type="text"
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                  onDeleteContractorFile(docRecord, file.id)
                                }
                              />
                            </Tooltip>
                          )}
                        </Space>
                      </Space>
                    ))}
                  </Space>
                }
              >
                <Button type="link" size="small">
                  {docRecord.fileCount} файл(ов)
                </Button>
              </Popover>
            ) : (
              <Tag bordered={false} className="ot-tag-muted">
                Нет загрузок
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: "Контроль",
      key: "control",
      width: 320,
      render: (_, record) => {
        const docRecord = getDocumentPayload(record);
        if (!docRecord) return null;
        const rejectionComment =
          docRecord.status === "rejected"
            ? normalizeText(docRecord.comment)
            : "";

        return (
          <Space size={6} direction="vertical" style={{ width: "100%" }}>
            <Space size={6} wrap>
              <Tag
                bordered={false}
                className={
                  docRecord.isRequired ? "ot-tag-required" : "ot-tag-optional"
                }
              >
                {docRecord.isRequired ? "Обязательный" : "Необязательный"}
              </Tag>
              <Tooltip title="Комментарии">
                <Button
                  size="small"
                  icon={<MessageOutlined />}
                  disabled={
                    !docRecord.contractorDocumentId || !docRecord.fileCount
                  }
                  onClick={() => onOpenDocumentComments(docRecord)}
                />
              </Tooltip>
              <Tag
                bordered={false}
                className={`ot-status-tag ot-status-${docRecord.status}`}
              >
                <Space size={4}>
                  {statusIcons[docRecord.status] || statusIcons.not_uploaded}
                  <span>
                    {statusText[docRecord.status] || statusText.not_uploaded}
                  </span>
                </Space>
              </Tag>
            </Space>
            {rejectionComment ? (
              <Tooltip title={rejectionComment}>
                <Text type="danger" ellipsis style={{ maxWidth: "100%" }}>
                  Причина: {rejectionComment}
                </Text>
              </Tooltip>
            ) : null}
            {docRecord.status === "rejected" && !rejectionComment ? (
              <Text type="secondary">Причина не указана</Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: "Действия",
      key: "actions",
      width: 120,
      render: (_, record) => {
        const docRecord = getDocumentPayload(record);
        if (!docRecord) return null;

        const items = [];

        if (isStaff) {
          items.push(
            {
              key: "approve",
              icon: <CheckOutlined />,
              label: "Подтвердить",
              onClick: () => onApprove(docRecord),
              disabled: !docRecord.contractorDocumentId || !docRecord.fileCount,
            },
            {
              key: "reject",
              icon: <CloseOutlined />,
              label: "Отклонить",
              onClick: () => onReject(docRecord),
              disabled: !docRecord.contractorDocumentId || !docRecord.fileCount,
              danger: true,
            },
          );
        }

        if (items.length === 0) {
          return null;
        }

        return (
          <Dropdown menu={{ items }} trigger={["click"]}>
            <Button
              size="small"
              icon={<MoreOutlined />}
              loading={uploadingDocId === docRecord.id}
            >
              Действия
            </Button>
          </Dropdown>
        );
      },
    },
  ];

  return (
    <>
      <Space
        size={8}
        style={{
          width: "100%",
          justifyContent: "flex-start",
          alignItems: "center",
          marginBottom: 12,
        }}
        wrap
      >
        <Text strong style={{ fontSize: 18 }}>
          Документы подрядчика
        </Text>
        <Space size={8} wrap>
          <AntTooltip title="Развернуть все">
            <Button
              size="small"
              onClick={handleExpandAll}
              disabled={allCategoryKeys.length === 0}
            >
              Развернуть все
            </Button>
          </AntTooltip>
          <AntTooltip title="Свернуть все">
            <Button
              size="small"
              onClick={handleCollapseAll}
              disabled={allCategoryKeys.length === 0}
            >
              Свернуть все
            </Button>
          </AntTooltip>
        </Space>
      </Space>
      <style>{`
        .ot-contractor-docs-table .ant-table {
          border: 1px solid #d7e3f0;
          border-radius: 14px;
          overflow: hidden;
          background: #ffffff;
        }
        .ot-contractor-docs-table .ant-table-thead > tr > th {
          background: #f2f7fd !important;
          color: #13233a !important;
          font-weight: 700;
          border-bottom: 1px solid #d7e3f0 !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
        }
        .ot-contractor-docs-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #e5edf7 !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
          vertical-align: top;
        }
        .ot-contractor-docs-table .ot-row-category-l1 td {
          background: #eaf2ff !important;
        }
        .ot-contractor-docs-table .ot-row-category-l2 td {
          background: #f4f8ff !important;
        }
        .ot-contractor-docs-table .ot-row-document td {
          background: #ffffff !important;
        }
        .ot-contractor-docs-table .ot-row-document:hover td {
          background: #f8fbff !important;
        }
        .ot-contractor-docs-table .ot-row-category-l1 td:first-child {
          border-left: 4px solid #7aa8f5;
        }
        .ot-contractor-docs-table .ot-row-category-l2 td:first-child {
          border-left: 4px solid #b7cdf4;
        }
        .ot-contractor-docs-table .ot-row-document td:first-child {
          border-left: 4px solid #e1ecfb;
        }
        .ot-contractor-docs-table .ot-row-clickable {
          cursor: pointer;
          user-select: none;
        }
        .ot-contractor-docs-table .ot-row-category-title {
          letter-spacing: -0.01em;
          color: #17253a;
        }
        .ot-contractor-docs-table .ot-row-path {
          font-size: 12px;
          color: #8192aa;
          line-height: 1.3;
        }
        .ot-contractor-docs-table .ot-row-document-title {
          color: #344156;
          font-weight: 500;
        }
        .ot-contractor-docs-table .ot-tag-soft {
          background: #e8f1ff;
          color: #2b4e90;
          border-radius: 999px;
          padding-inline: 10px;
          margin: 0;
        }
        .ot-contractor-docs-table .ot-tag-muted {
          background: #f1f4f9;
          color: #6e7f96;
          border-radius: 999px;
          padding-inline: 10px;
          margin: 0;
        }
        .ot-contractor-docs-table .ot-tag-required {
          background: #fff3dd;
          color: #9e5b00;
          border-radius: 999px;
          margin: 0;
        }
        .ot-contractor-docs-table .ot-tag-optional {
          background: #edf2f8;
          color: #5f738f;
          border-radius: 999px;
          margin: 0;
        }
        .ot-contractor-docs-table .ot-status-tag {
          border-radius: 999px;
          margin: 0;
        }
        .ot-contractor-docs-table .ot-status-approved {
          background: #eaf9ef;
          color: #1b7f45;
        }
        .ot-contractor-docs-table .ot-status-rejected {
          background: #fdeeee;
          color: #b33a40;
        }
        .ot-contractor-docs-table .ot-status-uploaded {
          background: #edf4ff;
          color: #2559b3;
        }
        .ot-contractor-docs-table .ot-status-not_uploaded {
          background: #fff5e7;
          color: #8b620f;
        }
        .ot-contractor-docs-table .ant-table-row-indent {
          display: none !important;
          width: 0 !important;
          padding-left: 0 !important;
        }
        .ot-contractor-docs-table .ant-btn-link {
          font-weight: 600;
        }
      `}</style>
      <Table
        className="ot-contractor-docs-table"
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={tableData}
        pagination={false}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: handleExpandedRowsChange,
          expandIcon: () => null,
          rowExpandable: (record) => hasExpandableChildren(record),
        }}
        rowClassName={(record) => {
          if (record.type === "category") {
            return record.depth === 0
              ? "ot-row-category-l1"
              : "ot-row-category-l2";
          }
          return "ot-row-document";
        }}
        locale={{ emptyText: "Документы не найдены" }}
        scroll={{ x: 1100 }}
        indentSize={0}
      />
      <FileViewer
        visible={viewerVisible}
        fileUrl={viewingFile?.url || ""}
        fileName={viewingFile?.name || "Файл"}
        mimeType={viewingFile?.mimeType || ""}
        onClose={() => {
          setViewerVisible(false);
          setViewingFile(null);
        }}
        onDownload={() => {
          if (!viewingFile?.record || !viewingFile?.fileId) return;
          return onDownloadContractorFile(
            viewingFile.record,
            viewingFile.fileId,
          );
        }}
      />
    </>
  );
};

export default ContractorDocumentsTable;
