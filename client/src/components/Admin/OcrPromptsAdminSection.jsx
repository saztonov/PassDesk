import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Space, Typography, message } from "antd";
import ocrService from "@/services/ocrService";

const { Text, Title } = Typography;
const { TextArea } = Input;

const PROMPT_LABELS = {
  passport_rf: "Паспорт РФ",
  foreign_passport: "Иностранный паспорт",
  patent: "Патент",
  kig: "КИГ",
  kig_back: "КИГ (оборот)",
  inn: "ИНН",
  snils: "СНИЛС",
  bank_details: "Банковские реквизиты",
  visa: "Виза",
  insurance_policy: "Страховой полис",
  registration_amina: "Регистрация (Amina)",
  scan: "Поиск контура (scan)",
  fallback_inn: "Fallback ИНН",
  fallback_snils: "Fallback СНИЛС",
};

const PROMPT_KEYS = [
  "passport_rf",
  "foreign_passport",
  "patent",
  "kig",
  "kig_back",
  "inn",
  "snils",
  "bank_details",
  "visa",
  "insurance_policy",
  "registration_amina",
  "scan",
  "fallback_inn",
  "fallback_snils",
];

const OcrPromptsAdminSection = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [prompts, setPrompts] = useState({});

  const orderedKeys = useMemo(() => PROMPT_KEYS, []);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const response = await ocrService.getPrompts();
      const data = response?.data;
      setFilePath(String(data?.filePath || ""));
      setPrompts(data?.prompts || {});
    } catch (error) {
      message.error("Не удалось загрузить OCR промпты");
      setPrompts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleChange = (key, value) => {
    setPrompts((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await ocrService.updatePrompts(prompts);
      message.success("OCR промпты сохранены");
      await loadPrompts();
    } catch (error) {
      message.error("Не удалось сохранить OCR промпты");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card loading={loading}>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Title level={4} style={{ margin: 0 }}>
            OCR промпты
          </Title>
          <Text type="secondary">
            Изменения применяются сразу после сохранения.
          </Text>
          {filePath ? (
            <Text type="secondary">Файл: {filePath}</Text>
          ) : null}
        </Space>
      </Card>

      {orderedKeys.map((key) => (
        <Card key={key} title={PROMPT_LABELS[key] || key} loading={loading}>
          <TextArea
            value={prompts[key] || ""}
            onChange={(event) => handleChange(key, event.target.value)}
            autoSize={{ minRows: 4, maxRows: 12 }}
          />
        </Card>
      ))}

      <Space>
        <Button type="primary" onClick={handleSave} loading={saving}>
          Сохранить
        </Button>
        <Button onClick={loadPrompts} disabled={loading || saving}>
          Обновить
        </Button>
      </Space>
    </Space>
  );
};

export default OcrPromptsAdminSection;
