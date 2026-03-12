import { useMemo, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Input,
  Space,
  Typography,
  Tag,
} from "antd";
import dayjs from "dayjs";
import mobileAccessService from "@/services/mobileAccessService";

const { Title, Text } = Typography;

const formatPhoneInput = (value) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) {
    return "";
  }

  const normalized = digits.startsWith("8")
    ? `7${digits.slice(1)}`
    : digits.length === 10
      ? `7${digits}`
      : digits;

  if (normalized.length <= 1) {
    return `+${normalized}`;
  }
  if (normalized.length <= 4) {
    return `+${normalized[0]} (${normalized.slice(1)}`;
  }
  if (normalized.length <= 7) {
    return `+${normalized[0]} (${normalized.slice(1, 4)}) ${normalized.slice(4)}`;
  }
  if (normalized.length <= 9) {
    return `+${normalized[0]} (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7)}`;
  }

  return `+${normalized[0]} (${normalized.slice(1, 4)}) ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
};

const QrAccessPage = () => {
  const { message } = AntApp.useApp();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const phoneDigits = useMemo(
    () => String(phone || "").replace(/\D/g, ""),
    [phone],
  );

  const handleSubmit = async () => {
    if (phoneDigits.length < 10) {
      message.warning("Введите телефон сотрудника");
      return;
    }

    setLoading(true);
    try {
      const data = await mobileAccessService.issueQuickQr({
        phone: phoneDigits,
        deviceLabel: "public-qr-access",
      });
      setResult(data || null);
      message.success("QR сформирован");
    } catch (error) {
      console.error("Failed to issue quick QR:", error);
      setResult(null);
      message.error(
        error?.response?.data?.message || "Не удалось получить QR",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!result?.qr?.token) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.qr.token);
      message.success("Код скопирован");
    } catch (error) {
      console.error("Failed to copy QR code:", error);
      message.error("Не удалось скопировать код");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "24px 16px 40px",
        background:
          "radial-gradient(circle at top, #f5f7fa 0%, #eef2f6 42%, #e3e8ef 100%)",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div>
            <Title level={2} style={{ marginBottom: 8 }}>
              QR для входа
            </Title>
            <Text type="secondary">
              Временный экран без OTP: введите номер телефона сотрудника и получите QR для прохода.
            </Text>
          </div>

          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Input
                size="large"
                placeholder="+7 (915) 120-20-30"
                value={phone}
                onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                onPressEnter={handleSubmit}
                inputMode="tel"
              />
              <Button type="primary" size="large" onClick={handleSubmit} loading={loading}>
                Показать QR
              </Button>
            </Space>
          </Card>

          {result?.qr?.qrImageDataUrl ? (
            <Card bordered={false} style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Space wrap>
                  <Tag color="blue">{result.employee?.fullName || "Сотрудник"}</Tag>
                  {result.activePass?.passNumber ? (
                    <Tag>{`Пропуск ${result.activePass.passNumber}`}</Tag>
                  ) : null}
                  <Tag color={result.qr?.tokenType === "one_time" ? "orange" : "green"}>
                    {result.qr?.tokenType === "one_time" ? "Одноразовый" : "Многоразовый"}
                  </Tag>
                </Space>

                <div
                  style={{
                    border: "1px solid #f0f0f0",
                    borderRadius: 16,
                    padding: 16,
                    display: "flex",
                    justifyContent: "center",
                    background: "#fff",
                  }}
                >
                  <img
                    src={result.qr.qrImageDataUrl}
                    alt="QR код доступа"
                    style={{ width: 260, height: 260, display: "block" }}
                  />
                </div>

                <Text type="secondary">
                  Действует до:{" "}
                  {result.qr?.expiresAt
                    ? dayjs(result.qr.expiresAt).format("DD.MM.YYYY HH:mm")
                    : "-"}
                </Text>

                <Input.TextArea value={result.qr.token || ""} rows={3} readOnly />
                <Button onClick={handleCopyCode}>Скопировать код</Button>
              </Space>
            </Card>
          ) : null}
        </Space>
      </div>
    </div>
  );
};

export default QrAccessPage;
