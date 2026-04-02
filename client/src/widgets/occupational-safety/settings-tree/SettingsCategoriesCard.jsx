import { memo, useMemo, useState, useEffect } from "react";
import { Card, Space, Typography, Button, Tree, Empty, Tooltip } from "antd";
import { PlusOutlined, FileAddOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

const SettingsCategoriesCard = memo(
  ({
    loading,
    treeData,
    onSelectCategoryNode,
    onAddCategory,
    onAddDocument,
  }) => {
    const allExpandableKeys = useMemo(() => {
      const keys = [];
      const walk = (nodes = []) => {
        nodes.forEach((node) => {
          if (!node) return;
          const children = node.children || [];
          if (children.length > 0) {
            keys.push(node.key);
            walk(children);
          }
        });
      };
      walk(treeData);
      return keys;
    }, [treeData]);

    const [expandedKeys, setExpandedKeys] = useState(null);

    useEffect(() => {
      if (!Array.isArray(expandedKeys)) return;
      const availableKeys = new Set(allExpandableKeys);
      setExpandedKeys((prev) => {
        const next = prev.filter((key) => availableKeys.has(key));
        const isSame =
          next.length === prev.length &&
          next.every((key, index) => key === prev[index]);
        return isSame ? prev : next;
      });
    }, [allExpandableKeys, expandedKeys]);

    const resolvedExpandedKeys = expandedKeys ?? allExpandableKeys;

    return (
      <Card size="small">
        <style>{`
          .ot-settings-tree .ant-tree-node-content-wrapper {
            min-width: 0;
          }
          .ot-settings-tree .ant-tree-title {
            display: block;
            width: 100%;
            min-width: 0;
          }
          .ot-settings-tree .ot-settings-tree-row {
            width: 100%;
            min-width: 0;
          }
          .ot-settings-tree .ot-settings-tree-main {
            min-width: 0;
          }
          .ot-settings-tree .ot-settings-tree-main-meta {
            min-width: 0;
          }
          .ot-settings-tree .ot-settings-tree-name {
            min-width: 0;
            flex: 1 1 auto;
          }
          .ot-settings-tree .ot-settings-tree-actions {
            flex-wrap: nowrap !important;
            align-items: center;
            flex-shrink: 0;
          }
          .ot-settings-tree .ot-settings-tree-upload-btn {
            max-width: 132px;
          }
          .ot-settings-tree .ot-settings-tree-upload-btn .ant-btn-icon + span {
            display: inline-block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          @media (max-width: 1360px) {
            .ot-settings-tree .ot-settings-tree-upload-btn {
              max-width: 116px;
            }
          }
        `}</style>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Space size={8} wrap style={{ minWidth: 0 }}>
              <Title level={5} style={{ margin: 0, minWidth: 0 }}>
                Категории и документы
              </Title>
              <Tooltip title="Развернуть все">
                <Button
                  size="small"
                  onClick={() => setExpandedKeys(allExpandableKeys)}
                  disabled={allExpandableKeys.length === 0}
                >
                  Развернуть все
                </Button>
              </Tooltip>
              <Tooltip title="Свернуть все">
                <Button
                  size="small"
                  onClick={() => setExpandedKeys([])}
                  disabled={allExpandableKeys.length === 0}
                >
                  Свернуть все
                </Button>
              </Tooltip>
            </Space>
            <Space size={8} wrap style={{ justifyContent: "flex-end" }}>
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => onAddCategory()}
                style={{ flexShrink: 0 }}
              >
                Категория
              </Button>
              <Button
                size="small"
                icon={<FileAddOutlined />}
                onClick={() => onAddDocument()}
                style={{ flexShrink: 0 }}
              >
                Документ
              </Button>
            </Space>
          </div>
          {loading ? (
            <Text type="secondary">Загрузка...</Text>
          ) : treeData.length === 0 ? (
            <Empty description="Категории и документы не созданы" />
          ) : (
            <Tree
              className="ot-settings-tree"
              blockNode
              showLine
              expandedKeys={resolvedExpandedKeys}
              treeData={treeData}
              onExpand={(keys) => setExpandedKeys(keys)}
              onSelect={(_, info) => onSelectCategoryNode?.(info?.node)}
            />
          )}
        </Space>
      </Card>
    );
  },
);

SettingsCategoriesCard.displayName = "SettingsCategoriesCard";

export default SettingsCategoriesCard;
