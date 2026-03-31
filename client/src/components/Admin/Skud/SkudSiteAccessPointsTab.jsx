import { useCallback, useEffect, useState } from "react";
import { App, Button, Card, Checkbox, Input, Modal, Space, Spin, Table, Tag, Typography } from "antd";
import { EditOutlined, ReloadOutlined } from "@ant-design/icons";
import skudService from "@/services/skudService";
import { constructionSiteService } from "@/services/constructionSiteService";

// Точки доступа (providerAccessPoints) загружаются в родительском SkudAdminSection
// и передаются сюда как props чтобы не делать лишний запрос к Sigur

const { Text } = Typography;

const SkudSiteAccessPointsTab = ({ providerAccessPoints = [], accessPointsLoading = false, onReloadAccessPoints }) => {
  const { message } = App.useApp();

  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);

  // маппинг siteId -> [sigurAccessPointId, ...]
  const [mappings, setMappings] = useState({});

  // модалка редактирования
  const [editSite, setEditSite] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [apSearch, setApSearch] = useState("");

  const fetchSites = useCallback(async () => {
    setSitesLoading(true);
    try {
      const limit = 100;
      let page = 1;
      let pages = 1;
      let allSites = [];

      while (page <= pages) {
        const res = await constructionSiteService.getAll({ page, limit });
        const data = res?.data?.data || {};
        const list = Array.isArray(data?.constructionSites)
          ? data.constructionSites
          : Array.isArray(data)
            ? data
            : [];
        const pagination = data?.pagination || {};
        pages = Number(pagination.pages || 1);

        allSites = allSites.concat(list);
        if (list.length < limit) {
          break;
        }
        page += 1;
      }

      setSites(allSites);
      return allSites;
    } catch {
      message.error("Не удалось загрузить объекты");
      return [];
    } finally {
      setSitesLoading(false);
    }
  }, [message]);

  const fetchMappingsForSites = useCallback(async (siteList) => {
    const entries = await Promise.allSettled(
      siteList.map(async (site) => {
        const rows = await skudService.getSiteAccessPoints(site.id);
        return { siteId: site.id, ids: (rows || []).map((r) => r.sigurAccessPointId) };
      }),
    );
    const next = {};
    for (const entry of entries) {
      if (entry.status === "fulfilled") {
        next[entry.value.siteId] = entry.value.ids;
      }
    }
    setMappings(next);
  }, []);

  const loadAll = useCallback(async () => {
    const list = await fetchSites();
    if (list.length > 0) await fetchMappingsForSites(list);
  }, [fetchSites, fetchMappingsForSites]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleEdit = (site) => {
    if (providerAccessPoints.length === 0 && onReloadAccessPoints) {
      onReloadAccessPoints();
    }
    setEditSite(site);
    setSelectedIds((mappings[site.id] || []).map(Number));
    setApSearch("");
  };

  const handleToggle = (apId, checked) => {
    const normalizedApId = Number(apId);
    setSelectedIds((prev) => {
      const normalizedPrev = prev.map(Number);
      if (checked) {
        return normalizedPrev.includes(normalizedApId) ? normalizedPrev : [...normalizedPrev, normalizedApId];
      }
      return normalizedPrev.filter((id) => id !== normalizedApId);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await skudService.setSiteAccessPoints(editSite.id, selectedIds);
      setMappings((prev) => ({ ...prev, [editSite.id]: selectedIds }));
      message.success("Точки доступа сохранены");
      setEditSite(null);
    } catch {
      message.error("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const getApName = (id) => {
    const ap = providerAccessPoints.find((p) => p.id === id || p.id === String(id));
    return ap ? (ap.label || ap.name) : `#${id}`;
  };

  const columns = [
    {
      title: "Объект",
      dataIndex: "name",
      key: "name",
      render: (name, record) => record.shortName || name,
    },
    {
      title: "Точки доступа Sigur",
      key: "accessPoints",
      render: (_, record) => {
        const ids = mappings[record.id];
        if (!ids) return <Spin size="small" />;
        if (ids.length === 0) return <Text type="secondary">Не назначены</Text>;
        return (
          <Space wrap>
            {ids.map((id) => (
              <Tag key={id}>{getApName(id)}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 100,
      render: (_, record) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
        >
          Изменить
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="Маппинг объектов → точки доступа Sigur"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadAll} loading={sitesLoading}>
              Обновить
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Укажите, какие точки доступа Sigur соответствуют каждому объекту PassDesk.
          При выдаче пропуска сотруднику доступ будет открыт на все привязанные точки.
        </Text>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={sites}
          loading={sitesLoading}
          pagination={false}
        />
      </Card>

      <Modal
        title={editSite ? `Точки доступа: ${editSite.shortName || editSite.name}` : ""}
        open={!!editSite}
        onCancel={() => setEditSite(null)}
        onOk={handleSave}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={saving}
        width={520}
      >
        <Spin spinning={accessPointsLoading}>
          <Input.Search
            placeholder="Поиск точки доступа"
            value={apSearch}
            onChange={(e) => setApSearch(e.target.value)}
            style={{ marginBottom: 12 }}
            allowClear
          />
          {providerAccessPoints.length === 0 ? (
            <Text type="secondary">Точки доступа не найдены</Text>
          ) : (
            <Space direction="vertical" style={{ width: "100%", maxHeight: 380, overflowY: "auto" }}>
              {providerAccessPoints.filter((ap) => {
                if (!apSearch.trim()) return true;
                const q = apSearch.trim().toLowerCase();
                return (ap.label || ap.name || "").toLowerCase().includes(q)
                  || (ap.pathLabel || "").toLowerCase().includes(q);
              }).map((ap) => (
                <Checkbox
                  key={ap.id}
                  checked={selectedIds.includes(Number(ap.id))}
                  onChange={(e) => handleToggle(ap.id, e.target.checked)}
                >
                  {ap.label || ap.name}
                  {ap.pathLabel && (
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                      {ap.pathLabel}
                    </Text>
                  )}
                </Checkbox>
              ))}
            </Space>
          )}
        </Spin>
      </Modal>
    </Space>
  );
};

export default SkudSiteAccessPointsTab;
