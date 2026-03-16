import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Result,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  CopyOutlined,
  LockOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import userProfileService from "@/services/userProfileService";
import profileService from "@/services/profileService";
import { forbiddenPasswordValidator } from "@/utils/forbiddenPasswords";

const { Title, Text } = Typography;

const formatDateTime = (value) => {
  if (!value) {
    return "Не указан";
  }

  const date = dayjs(value);
  return date.isValid() ? date.format("DD.MM.YYYY HH:mm") : "Не указан";
};

const getEmployeeFullName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();

const LaborerCabinetScreen = () => {
  const { t } = useTranslation();
  const { message } = AntApp.useApp();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordForm] = Form.useForm();

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userProfileService.getMyProfile();
      setEmployee(response?.data?.employee || null);
    } catch (error) {
      console.error("Failed to load laborer cabinet profile:", error);
      setEmployee(null);
      message.error(
        error?.response?.data?.message || t("cabinet.profileLoadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const activePass = useMemo(
    () => (Array.isArray(employee?.passes) ? employee.passes[0] : null),
    [employee?.passes],
  );
  const mapping = useMemo(
    () =>
      Array.isArray(employee?.employeeCounterpartyMappings)
        ? employee.employeeCounterpartyMappings[0]
        : null,
    [employee?.employeeCounterpartyMappings],
  );
  const employeeName = getEmployeeFullName(employee) || t("cabinet.employee");
  const departmentName = mapping?.department?.name || "Не указано";
  const counterpartyName =
    employee?.counterparty?.name || mapping?.counterparty?.name || "Не указано";
  const positionName = employee?.position?.name || "Не указано";
  const phone = employee?.phone || "Не указан";
  const dismissedAt = mapping?.dismissedAt || null;

  const handleIssueQr = async () => {
    try {
      setQrLoading(true);
      const response = await userProfileService.issueMyProfileSkudQr({
        channel: "mobile",
      });
      setQrData(response?.data || null);
      message.success(t("cabinet.qrIssued"));
    } catch (error) {
      console.error("Failed to issue QR in laborer cabinet:", error);
      setQrData(null);
      message.error(error?.response?.data?.message || t("cabinet.qrIssueError"));
    } finally {
      setQrLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (!qrData?.qr?.token) {
      return;
    }

    try {
      await navigator.clipboard.writeText(qrData.qr.token);
      message.success(t("cabinet.tokenCopied"));
    } catch (error) {
      console.error("Failed to copy QR token:", error);
      message.error(t("cabinet.tokenCopyError"));
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      setPasswordSaving(true);
      await profileService.changePassword(
        values.currentPassword,
        values.newPassword,
      );
      message.success(t("profile.passwordChanged"));
      passwordForm.resetFields();
      setPasswordModalOpen(false);
    } catch (error) {
      if (error?.errorFields) {
        return;
      }
      console.error("Failed to change password from cabinet:", error);
      message.error(
        error?.response?.data?.message || t("profile.passwordChangeError"),
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "calc(100vh - 104px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <Result
          status="404"
          title={t("cabinet.notFoundTitle")}
          subTitle={t("cabinet.notFoundDescription")}
          extra={
            <Button onClick={loadProfile} icon={<ReloadOutlined />}>
              {t("cabinet.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 24 }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card
          bordered={false}
          style={{
            borderRadius: 24,
            overflow: "hidden",
            background:
              "linear-gradient(180deg, #0f172a 0%, #10254d 55%, #12356b 100%)",
            color: "#fff",
          }}
          styles={{ body: { padding: 24 } }}
        >
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            <Space align="center" size={12}>
              <Avatar
                size={56}
                icon={<UserOutlined />}
                style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
              />
              <div>
                <Text style={{ color: "rgba(255,255,255,0.72)", display: "block" }}>
                  {t("cabinet.title")}
                </Text>
                <Title level={4} style={{ color: "#fff", margin: 0 }}>
                  {employeeName}
                </Title>
              </div>
            </Space>

            <div
              style={{
                background: "rgba(255,255,255,0.08)",
                borderRadius: 20,
                padding: 20,
                textAlign: "center",
              }}
            >
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Space wrap style={{ justifyContent: "center" }}>
                  {activePass?.passNumber ? (
                    <Tag color="blue">{`${t("cabinet.passLabel")} ${activePass.passNumber}`}</Tag>
                  ) : (
                    <Tag>{t("cabinet.noPass")}</Tag>
                  )}
                  {dismissedAt ? (
                    <Tag color="red">
                      {`${t("cabinet.dismissedAt")} ${formatDateTime(dismissedAt)}`}
                    </Tag>
                  ) : null}
                </Space>

                {qrData?.qr?.qrImageDataUrl ? (
                  <Image
                    preview={false}
                    src={qrData.qr.qrImageDataUrl}
                    alt="QR"
                    width={220}
                    style={{
                      background: "#fff",
                      padding: 14,
                      borderRadius: 20,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 220,
                      height: 220,
                      margin: "0 auto",
                      borderRadius: 20,
                      background: "rgba(255,255,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Space direction="vertical" size={10} align="center">
                      <QrcodeOutlined style={{ fontSize: 48, color: "#fff" }} />
                      <Text style={{ color: "rgba(255,255,255,0.72)" }}>
                        {t("cabinet.qrPlaceholder")}
                      </Text>
                    </Space>
                  </div>
                )}

                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<QrcodeOutlined />}
                  onClick={handleIssueQr}
                  loading={qrLoading}
                >
                  {qrData?.qr?.qrImageDataUrl
                    ? t("cabinet.refreshQr")
                    : t("cabinet.getQr")}
                </Button>

                {qrData?.qr?.token ? (
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Text style={{ color: "rgba(255,255,255,0.72)" }}>
                      {`${t("cabinet.validUntil")}: ${formatDateTime(qrData.qr.expiresAt)}`}
                    </Text>
                    <Input.TextArea readOnly value={qrData.qr.token} rows={3} />
                    <Button icon={<CopyOutlined />} onClick={handleCopyToken} block>
                      {t("cabinet.copyCode")}
                    </Button>
                  </Space>
                ) : null}
              </Space>
            </div>
          </Space>
        </Card>

        <Card
          bordered={false}
          title={t("cabinet.cardTitle")}
          style={{ borderRadius: 24 }}
          extra={
            <Button
              icon={<LockOutlined />}
              onClick={() => setPasswordModalOpen(true)}
            >
              {t("profile.changePassword")}
            </Button>
          }
        >
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {dismissedAt ? (
              <Alert
                type="warning"
                showIcon
                message={t("cabinet.dismissedWarning")}
                description={`${t("cabinet.dismissedAt")}: ${formatDateTime(dismissedAt)}`}
              />
            ) : null}

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t("cabinet.fields.fullName")}>
                {employeeName}
              </Descriptions.Item>
              <Descriptions.Item label={t("cabinet.fields.counterparty")}>
                {counterpartyName}
              </Descriptions.Item>
              <Descriptions.Item label={t("cabinet.fields.department")}>
                {departmentName}
              </Descriptions.Item>
              <Descriptions.Item label={t("cabinet.fields.position")}>
                {positionName}
              </Descriptions.Item>
              <Descriptions.Item label={t("cabinet.fields.phone")}>
                {phone}
              </Descriptions.Item>
              <Descriptions.Item label={t("cabinet.fields.citizenship")}>
                {employee?.citizenship?.name || "Не указано"}
              </Descriptions.Item>
            </Descriptions>

            {!activePass ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("cabinet.noActivePassDescription")}
              />
            ) : null}
          </Space>
        </Card>
      </Space>

      <Modal
        title={t("profile.changePasswordTitle")}
        open={passwordModalOpen}
        onCancel={() => {
          setPasswordModalOpen(false);
          passwordForm.resetFields();
        }}
        onOk={handleChangePassword}
        okText={t("profile.changePassword")}
        cancelText={t("common.cancel")}
        confirmLoading={passwordSaving}
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="currentPassword"
            label={t("profile.currentPassword")}
            rules={[
              {
                required: true,
                message: t("profile.currentPassword"),
              },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label={t("profile.newPassword")}
            rules={[
              {
                required: true,
                message: t("profile.newPassword"),
              },
              {
                min: 8,
                message: t("auth.passwordMin"),
              },
              {
                ...forbiddenPasswordValidator,
              },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label={t("profile.confirmNewPassword")}
            dependencies={["newPassword"]}
            rules={[
              {
                required: true,
                message: t("profile.confirmNewPassword"),
              },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t("auth.passwordsNotMatch")));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LaborerCabinetScreen;
