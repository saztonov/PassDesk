import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { CreditCardOutlined, UserOutlined } from "@ant-design/icons";
import skudService from "@/services/skudService";
import { employeeService } from "@/services/employeeService";
import { employeeApi } from "@/entities/employee";
import { constructionSiteService } from "@/services/constructionSiteService";

const { Text } = Typography;

const buildName = (e) =>
  [e?.lastName, e?.firstName, e?.middleName].filter(Boolean).join(" ") ||
  e?.fullName ||
  e?.email ||
  String(e?.id || "");

const SkudPassIssuanceTab = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  // поиск сотрудника
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [employeeSearchLoading, setEmployeeSearchLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [employeeData, setEmployeeData] = useState(null);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  // объекты
  const [allSites, setAllSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);

  // сохранение
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // загрузка всех объектов
  useEffect(() => {
    setSitesLoading(true);
    constructionSiteService
      .getAll()
      .then((res) => {
        const list = res?.data?.data?.constructionSites || res?.data?.data || [];
        setAllSites(list);
      })
      .catch(() => message.error("Не удалось загрузить объекты"))
      .finally(() => setSitesLoading(false));
  }, [message]);

  const searchEmployees = useCallback(
    async (search = "") => {
      setEmployeeSearchLoading(true);
      try {
        const res = await employeeService.getAll({
          page: 1,
          limit: 50,
          activeOnly: "true",
          ...(search ? { search } : {}),
        });
        const items = Array.isArray(res?.data?.employees) ? res.data.employees : [];
        setEmployeeOptions(items.map((e) => ({ value: e.id, label: buildName(e) })));
      } catch {
        // тихо
      } finally {
        setEmployeeSearchLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    searchEmployees();
  }, [searchEmployees]);

  const handleEmployeeSelect = useCallback(
    async (employeeId) => {
      setSelectedEmployeeId(employeeId);
      setEmployeeData(null);
      setSelectedSiteIds([]);
      setLastResult(null);
      form.resetFields(["cardNumber"]);

      if (!employeeId) return;

      setEmployeeLoading(true);
      try {
        const res = await employeeService.getById(employeeId);
        const emp = res?.data?.employee || res?.data;
        setEmployeeData(emp);

        // текущие объекты сотрудника
        const mappings = Array.isArray(emp?.employeeCounterpartyMappings)
          ? emp.employeeCounterpartyMappings.filter((m) => !m?.dismissedAt)
          : [];
        const siteIds = [...new Set(mappings.map((m) => m.constructionSiteId).filter(Boolean))];
        setSelectedSiteIds(siteIds);
      } catch {
        message.error("Не удалось загрузить данные сотрудника");
      } finally {
        setEmployeeLoading(false);
      }
    },
    [form, message],
  );

  const handleSiteToggle = (siteId, checked) => {
    setSelectedSiteIds((prev) =>
      checked ? [...prev, siteId] : prev.filter((id) => id !== siteId),
    );
  };

  const handleSubmit = async () => {
    let cardNumber;
    try {
      const values = await form.validateFields();
      cardNumber = values.cardNumber?.trim();
    } catch {
      return;
    }

    setSubmitting(true);
    setLastResult(null);
    try {
      // 1. обновить объекты сотрудника если изменились
      const originalIds = Array.isArray(employeeData?.employeeCounterpartyMappings)
        ? [...new Set(
            employeeData.employeeCounterpartyMappings
              .filter((m) => !m?.dismissedAt)
              .map((m) => m.constructionSiteId)
              .filter(Boolean),
          )]
        : [];

      const siteIdsChanged =
        selectedSiteIds.length !== originalIds.length ||
        selectedSiteIds.some((id) => !originalIds.includes(id));

      if (siteIdsChanged) {
        await employeeApi.updateConstructionSites(selectedEmployeeId, selectedSiteIds);
      }

      // 2. выдать карту
      await skudService.assignCard({
        employeeId: selectedEmployeeId,
        cardNumber,
      });

      setLastResult({ type: "success", cardNumber });
      form.resetFields(["cardNumber"]);
      message.success("Заявка на выдачу пропуска отправлена. Дождитесь синхронизации с СКУД");
    } catch (err) {
      const errMsg = err?.response?.data?.message || err?.message || "Ошибка при выдаче пропуска";
      setLastResult({ type: "error", message: errMsg });
      message.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedEmployee = employeeData;
  const sitesWithMapping = allSites.filter((s) => selectedSiteIds.includes(s.id));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%", maxWidth: 680 }}>
      <Card title={<Space><CreditCardOutlined /><span>Выдача пропуска</span></Space>}>
        <Space direction="vertical" size={20} style={{ width: "100%" }}>

          {/* Выбор сотрудника */}
          <div>
            <Text strong>Сотрудник</Text>
            <Select
              showSearch
              allowClear
              placeholder="Поиск по имени, ИНН, СНИЛС..."
              style={{ width: "100%", marginTop: 6 }}
              options={employeeOptions}
              loading={employeeSearchLoading}
              onSearch={searchEmployees}
              onChange={handleEmployeeSelect}
              filterOption={false}
              suffixIcon={<UserOutlined />}
              popupMatchSelectWidth
            />
          </div>

          {/* Данные выбранного сотрудника */}
          {selectedEmployeeId && (
            <Spin spinning={employeeLoading}>
              {selectedEmployee && (
                <Space direction="vertical" size={16} style={{ width: "100%" }}>

                  {/* Объекты */}
                  <div>
                    <Text strong>Объекты доступа</Text>
                    <Spin spinning={sitesLoading}>
                      <Space
                        direction="vertical"
                        style={{ width: "100%", marginTop: 6, maxHeight: 220, overflowY: "auto" }}
                      >
                        {allSites.length === 0 ? (
                          <Text type="secondary">Нет объектов</Text>
                        ) : (
                          allSites.map((site) => (
                            <Checkbox
                              key={site.id}
                              checked={selectedSiteIds.includes(site.id)}
                              onChange={(e) => handleSiteToggle(site.id, e.target.checked)}
                            >
                              {site.shortName || site.name}
                            </Checkbox>
                          ))
                        )}
                      </Space>
                    </Spin>
                    {sitesWithMapping.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Выбрано:{" "}
                        </Text>
                        {sitesWithMapping.map((s) => (
                          <Tag key={s.id} style={{ marginBottom: 4 }}>
                            {s.shortName || s.name}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>

                  <Divider style={{ margin: "4px 0" }} />

                  {/* Номер карты */}
                  <Form form={form} layout="vertical">
                    <Form.Item
                      label="Номер карты"
                      name="cardNumber"
                      rules={[{ required: true, message: "Введите номер карты" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        placeholder="Приложите карту к считывателю или введите вручную"
                        prefix={<CreditCardOutlined />}
                        allowClear
                      />
                    </Form.Item>
                  </Form>

                  <Button
                    type="primary"
                    size="large"
                    block
                    loading={submitting}
                    onClick={handleSubmit}
                    disabled={selectedSiteIds.length === 0}
                  >
                    Выдать пропуск
                  </Button>

                  {selectedSiteIds.length === 0 && (
                    <Text type="warning" style={{ fontSize: 12 }}>
                      Выберите хотя бы один объект
                    </Text>
                  )}
                </Space>
              )}
            </Spin>
          )}

          {/* Результат */}
          {lastResult && (
            <Alert
              type={lastResult.type}
              message={
                lastResult.type === "success"
                  ? `Заявка на выдачу пропуска отправлена. Карта: ${lastResult.cardNumber}`
                  : lastResult.message
              }
              showIcon
              closable
              onClose={() => setLastResult(null)}
            />
          )}

        </Space>
      </Card>
    </Space>
  );
};

export default SkudPassIssuanceTab;
