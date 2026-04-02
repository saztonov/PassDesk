import { useState, useCallback } from "react";
import { Modal, Checkbox, Space, App } from "antd";
import { employeeApi } from "@/entities/employee";
import api from "@/services/api";
import settingsService from "@/services/settingsService";
import { constructionSiteService } from "@/services/constructionSiteService";
import { useAuthStore } from "@/store/authStore";

const EmployeeSitesModal = ({ visible, employee, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const { user } = useAuthStore();
  const [constructionSites, setConstructionSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchConstructionSites = useCallback(async () => {
    try {
      if (!user?.counterpartyId) {
        setConstructionSites([]);
        return;
      }

      // Получаем публичные настройки (доступно всем пользователям)
      const settingsResponse = await settingsService.getPublicSettings();
      const defaultCounterpartyId =
        settingsResponse?.data?.defaultCounterpartyId;

      // Если это default контрагент - загружаем все объекты
      if (user.counterpartyId === defaultCounterpartyId) {
        const sites = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
          const response = await api.get("/construction-sites", {
            params: { page, limit: 100 },
          });
          const payload = response?.data?.data || {};
          const chunk = Array.isArray(payload.constructionSites)
            ? payload.constructionSites
            : [];

          sites.push(...chunk);
          totalPages = Number(payload?.pagination?.pages || 1);
          page += 1;
        }

        setConstructionSites(sites);
      } else {
        // Для остальных контрагентов - только назначенные объекты
        const { data } = await constructionSiteService.getCounterpartyObjects(
          user.counterpartyId,
        );
        setConstructionSites(data.data || []);
      }
    } catch (error) {
      console.error("Error loading construction sites:", error);
      // Не показываем ошибку, если просто нет объектов
      setConstructionSites([]);
    }
  }, [user?.counterpartyId]);

  const syncSelectedSites = useCallback(() => {
    if (!employee?.employeeCounterpartyMappings) {
      setSelectedSites([]);
      return;
    }

    const siteIds = employee.employeeCounterpartyMappings
      .map((mapping) => mapping.constructionSiteId)
      .filter(Boolean);
    setSelectedSites(siteIds);
  }, [employee]);

  const handleOpenChange = useCallback(
    async (open) => {
      if (!open) {
        setSelectedSites([]);
        return;
      }

      syncSelectedSites();
      await fetchConstructionSites();
    },
    [fetchConstructionSites, syncSelectedSites],
  );

  const handleSiteChange = (siteId, checked) => {
    if (checked) {
      setSelectedSites([...selectedSites, siteId]);
    } else {
      setSelectedSites(selectedSites.filter((id) => id !== siteId));
    }
  };

  const handleOk = async () => {
    try {
      setLoading(true);
      // Отправляем выбранные объекты на сервер
      await employeeApi.updateConstructionSites(employee.id, selectedSites);
      message.success("Объекты обновлены");
      onCancel(); // Закрываем модальное окно
      onSuccess(); // Обновляем данные в родительском компоненте
    } catch (error) {
      message.error(
        error?.response?.data?.message || "Ошибка при сохранении объектов",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Выбор объектов строительства"
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      okText="ОК"
      cancelText="Отмена"
      confirmLoading={loading}
      width={600}
      afterOpenChange={handleOpenChange}
    >
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {constructionSites.length === 0 ? (
          <div
            style={{
              padding: "20px",
              background: "#f0f5ff",
              border: "1px solid #adc6ff",
              borderRadius: "6px",
              textAlign: "center",
              color: "#1890ff",
            }}
          >
            Обратитесь к администратору для назначения доступных объектов
          </div>
        ) : (
          <Space direction="vertical" style={{ width: "100%" }}>
            {constructionSites.map((site) => (
              <Checkbox
                key={site.id}
                checked={selectedSites.includes(site.id)}
                onChange={(e) => handleSiteChange(site.id, e.target.checked)}
              >
                {site.shortName || site.name}
              </Checkbox>
            ))}
          </Space>
        )}
      </div>
    </Modal>
  );
};

export default EmployeeSitesModal;
