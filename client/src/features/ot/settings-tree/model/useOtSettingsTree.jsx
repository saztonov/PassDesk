import { useCallback, useMemo } from "react";
import { Button, Space, Tooltip, Typography } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import groupDocumentsByCategory from "@/entities/ot/document/model/groupDocumentsByCategory";
import useOtCategoryDocumentsModal from "@/features/ot/category-documents-modal/model/useOtCategoryDocumentsModal";

const { Text } = Typography;

const useOtSettingsTree = ({
  settingsCategories,
  settingsDocuments,
  handleDeleteCategory,
  handleOpenCategoryModal,
  handleOpenDocumentModal,
}) => {
  const settingsDocumentsByCategory = useMemo(() => {
    return groupDocumentsByCategory(settingsDocuments || []);
  }, [settingsDocuments]);

  const {
    categoryDocumentsModalOpen,
    categoryDocumentsTarget,
    categoryDocumentsList,
    handleOpenCategoryDocumentsModal,
    handleCloseCategoryDocumentsModal,
  } = useOtCategoryDocumentsModal({ settingsDocumentsByCategory });

  const settingsCategoryTree = useMemo(() => {
    const stopTreeAction = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const countDocuments = (node) => {
      const ownDocs = (settingsDocumentsByCategory.get(String(node.id)) || [])
        .length;
      const childDocs = (node.children || []).reduce(
        (sum, child) => sum + countDocuments(child),
        0,
      );
      return ownDocs + childDocs;
    };

    const buildTree = (nodes) =>
      (nodes || []).map((node) => {
        const categoryChildren = buildTree(node.children || []);
        const ownDocumentsCount = (
          settingsDocumentsByCategory.get(String(node.id)) || []
        ).length;

        return {
          key: `cat-${node.id}`,
          categoryId: node.id,
          categoryName: node.name,
          title: (
            <div
              className="ot-settings-tree-row"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                minWidth: 0,
              }}
            >
              <div
                className="ot-settings-tree-main"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <FolderOpenOutlined style={{ color: "#2f5fba" }} />
                <div
                  className="ot-settings-tree-main-meta"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Text
                    className="ot-settings-tree-name"
                    strong
                    style={{
                      display: "inline-block",
                      minWidth: 0,
                      maxWidth: "100%",
                      flex: "0 1 auto",
                    }}
                    ellipsis={{ tooltip: node.name }}
                  >
                    {node.name}
                  </Text>
                  <Text
                    type="secondary"
                    style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    ({countDocuments(node)})
                  </Text>
                  {node.description && (
                    <Tooltip title={node.description}>
                      <InfoCircleOutlined style={{ flexShrink: 0 }} />
                    </Tooltip>
                  )}
                </div>
              </div>
              <Space
                className="ot-settings-tree-actions"
                size={4}
                wrap={false}
                style={{ flexShrink: 0 }}
              >
                <Tooltip title="Добавить подкатегорию">
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={(event) => {
                      stopTreeAction(event);
                      handleOpenCategoryModal(null, node.id);
                    }}
                  />
                </Tooltip>
                <Tooltip title="Добавить документ">
                  <Button
                    className="ot-settings-tree-upload-btn"
                    size="small"
                    icon={<FileAddOutlined />}
                    onClick={(event) => {
                      stopTreeAction(event);
                      handleOpenDocumentModal(null, node.id);
                    }}
                  >
                    Подгрузка
                  </Button>
                </Tooltip>
                <Button
                  size="small"
                  type="link"
                  style={{
                    width: 90,
                    justifyContent: "center",
                    paddingInline: 0,
                  }}
                  onClick={(event) => {
                    stopTreeAction(event);
                    handleOpenCategoryDocumentsModal(node);
                  }}
                >
                  Файлы: {ownDocumentsCount}
                </Button>
                <Tooltip title="Редактировать">
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      stopTreeAction(event);
                      handleOpenCategoryModal(node);
                    }}
                  />
                </Tooltip>
                <Tooltip title="Удалить">
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(event) => {
                      stopTreeAction(event);
                      handleDeleteCategory(node);
                    }}
                  />
                </Tooltip>
              </Space>
            </div>
          ),
          children: categoryChildren,
        };
      });

    return buildTree(settingsCategories || []);
  }, [
    settingsCategories,
    settingsDocumentsByCategory,
    handleDeleteCategory,
    handleOpenCategoryDocumentsModal,
    handleOpenCategoryModal,
    handleOpenDocumentModal,
  ]);

  const handleSelectSettingsCategoryNode = useCallback(
    (treeNode) => {
      if (!treeNode?.categoryId) return;
      handleOpenCategoryDocumentsModal({
        id: treeNode.categoryId,
        name: treeNode.categoryName || "",
      });
    },
    [handleOpenCategoryDocumentsModal],
  );

  return {
    settingsCategoryTree,
    categoryDocumentsModalOpen,
    categoryDocumentsTarget,
    categoryDocumentsList,
    handleCloseCategoryDocumentsModal,
    handleSelectSettingsCategoryNode,
  };
};

export default useOtSettingsTree;
