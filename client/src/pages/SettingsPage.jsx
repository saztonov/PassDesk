import { useState, useEffect, useCallback } from "react";
import { Form, Select, Button, message, Spin, Typography, Divider, Space } from "antd";
import { SaveOutlined, UploadOutlined, FormOutlined } from "@ant-design/icons";
import settingsService from "@/services/settingsService";
import { counterpartyService } from "@/services/counterpartyService";
import EmployeeFieldsSettingsModal from "@/components/Admin/EmployeeFieldsSettingsModal";
import EmployeeImportModal from "@/modules/employees/ui/EmployeeImportModal";
import {
  EMPLOYEE_IMPORT_PROFILE_1C_ZUP,
  EMPLOYEE_IMPORT_PROFILE_DEFAULT,
  getEmployeeImportProfile,
} from "@/modules/employees/model/employeeImportProfiles";

const { Title, Text } = Typography;

const SettingsPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [counterparties, setCounterparties] = useState([]);
  const [modals, setModals] = useState({
    importOpen: false,
    importProfile: EMPLOYEE_IMPORT_PROFILE_DEFAULT,
    fieldsSettingsOpen: false,
  });
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [counterpartiesResult, settingsResult] = await Promise.allSettled([
        counterpartyService.getAll({
          limit: 10000,
          page: 1,
        }),
        settingsService.getSettings(),
      ]);

      if (counterpartiesResult.status === "fulfilled") {
        const counterpartiesResponse = counterpartiesResult.value;
        const counterpartiesList =
          counterpartiesResponse?.data?.data?.counterparties ||
          counterpartiesResponse?.data?.counterparties ||
          counterpartiesResponse?.data?.data ||
          counterpartiesResponse?.data ||
          [];
        setCounterparties(counterpartiesList);
      } else {
        console.error(
          "Error loading counterparties for settings:",
          counterpartiesResult.reason,
        );
        setCounterparties([]);
      }

      if (settingsResult.status === "fulfilled") {
        const settingsResponse = settingsResult.value;
        const settingsArray = Array.isArray(settingsResponse?.data)
          ? settingsResponse.data
          : Array.isArray(settingsResponse?.data?.data)
            ? settingsResponse.data.data
            : Array.isArray(settingsResponse)
              ? settingsResponse
              : [];
        const defaultCounterpartySetting = settingsArray.find(
          (s) => s.key === "default_counterparty_id",
        );

        if (defaultCounterpartySetting?.value) {
          form.setFieldsValue({
            defaultCounterpartyId: defaultCounterpartySetting.value,
          });
        }
      } else {
        console.error("Error loading settings:", settingsResult.reason);
        message.error("Ошибка загрузки настроек");
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      message.error("Ошибка загрузки настроек");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      await settingsService.updateSetting(
        "default_counterparty_id",
        values.defaultCounterpartyId,
      );

      message.success("Настройки успешно сохранены");
    } catch (error) {
      console.error("Error saving settings:", error);
      message.error(
        error.response?.data?.message || "Ошибка сохранения настроек",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "50px" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: 24,
      }}
    >
      <Title level={4}>Регистрация новых пользователей</Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        При регистрации новые пользователи автоматически будут привязаны к
        выбранному контрагенту
      </Text>

      <div style={{ maxWidth: "800px" }}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="defaultCounterpartyId"
            label="Контрагент по умолчанию"
            rules={[
              { required: true, message: "Выберите контрагента по умолчанию" },
            ]}
          >
            <Select
              showSearch
              placeholder="Выберите контрагента"
              optionFilterProp="children"
              size="large"
              filterOption={(input, option) =>
                (option?.children ?? "")
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
            >
              {counterparties.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.name} (
                  {c.type === "customer"
                    ? "Заказчик"
                    : c.type === "contractor"
                      ? "Подрядчик"
                      : "Генподрядчик"}
                  )
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
              size="large"
            >
              Сохранить настройки
            </Button>
          </Form.Item>
        </Form>
      </div>

      <Divider />

      <div style={{ marginTop: "24px" }}>
        <Title level={4}>Настройка форм</Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Управление отображением и обязательностью полей в форме сотрудника
        </Text>
        <Button
          icon={<FormOutlined />}
          onClick={() =>
            setModals((prev) => ({ ...prev, fieldsSettingsOpen: true }))
          }
          size="large"
        >
          Настройка полей сотрудника
        </Button>
      </div>

      <Divider />

      <div style={{ marginTop: "24px" }}>
        <Title level={4}>Загрузка данных</Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          Импортируйте сотрудников из файла Excel
        </Text>
        <Space wrap>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={() =>
              setModals((prev) => ({
                ...prev,
                importOpen: true,
                importProfile: EMPLOYEE_IMPORT_PROFILE_DEFAULT,
              }))
            }
            size="large"
          >
            {getEmployeeImportProfile(EMPLOYEE_IMPORT_PROFILE_DEFAULT).actionTitle}
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() =>
              setModals((prev) => ({
                ...prev,
                importOpen: true,
                importProfile: EMPLOYEE_IMPORT_PROFILE_1C_ZUP,
              }))
            }
            size="large"
          >
            {getEmployeeImportProfile(EMPLOYEE_IMPORT_PROFILE_1C_ZUP).actionTitle}
          </Button>
        </Space>
      </div>
      <EmployeeImportModal
        visible={modals.importOpen}
        profile={modals.importProfile}
        onCancel={() =>
          setModals((prev) => ({
            ...prev,
            importOpen: false,
            importProfile: EMPLOYEE_IMPORT_PROFILE_DEFAULT,
          }))
        }
        onSuccess={() => {
          message.success(
            getEmployeeImportProfile(modals.importProfile).successMessage,
          );
          setModals((prev) => ({
            ...prev,
            importOpen: false,
            importProfile: EMPLOYEE_IMPORT_PROFILE_DEFAULT,
          }));
        }}
      />

      <EmployeeFieldsSettingsModal
        visible={modals.fieldsSettingsOpen}
        onCancel={() =>
          setModals((prev) => ({ ...prev, fieldsSettingsOpen: false }))
        }
      />
    </div>
  );
};

export default SettingsPage;
