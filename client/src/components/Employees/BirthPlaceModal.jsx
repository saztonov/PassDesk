import { useState } from "react";
import { Button, Form, Input, Modal, Select } from "antd";
import { EnvironmentOutlined } from "@ant-design/icons";

const { Option } = Select;

/**
 * Показывает краткое описание места рождения по заполненным полям.
 */
const formatBirthPlace = ({ countryName, region, city }) => {
  const parts = [countryName, region, city].filter(Boolean);
  return parts.join(", ") || null;
};

const BirthPlaceModal = ({
  form,
  citizenships = [],
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [localValues, setLocalValues] = useState({});

  const handleOpen = () => {
    const citizenshipId = form.getFieldValue("citizenshipId") || null;
    setLocalValues({
      birthCountryId:
        form.getFieldValue("birthCountryId") || citizenshipId,
      birthRegion: form.getFieldValue("birthRegion") || "",
      birthCity: form.getFieldValue("birthCity") || "",
    });
    setOpen(true);
  };

  const handleOk = () => {
    form.setFieldsValue(localValues);
    setOpen(false);
  };

  const handleCancel = () => setOpen(false);

  // Для отображения в кнопке
  return (
    <>
      <Form.Item noStyle shouldUpdate>
        {() => {
          const countryId = form.getFieldValue("birthCountryId");
          const region = form.getFieldValue("birthRegion");
          const city = form.getFieldValue("birthCity");
          const countryName = citizenships.find((c) => c.id === countryId)?.name;
          const text = formatBirthPlace({ countryName, region, city });
          return (
            <Button
              icon={<EnvironmentOutlined />}
              onClick={handleOpen}
              disabled={disabled}
              style={{ width: "100%", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {text || "Указать место рождения"}
            </Button>
          );
        }}
      </Form.Item>

      {/* Скрытые поля чтобы antd Form знал об этих значениях */}
      <Form.Item name="birthCountryId" hidden><Input /></Form.Item>
      <Form.Item name="birthRegion" hidden><Input /></Form.Item>
      <Form.Item name="birthCity" hidden><Input /></Form.Item>

      <Modal
        title="Место рождения"
        open={open}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Сохранить"
        cancelText="Отмена"
        width={420}
        destroyOnClose={false}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Страна</div>
            <Select
              value={localValues.birthCountryId}
              onChange={(v) => setLocalValues((prev) => ({ ...prev, birthCountryId: v }))}
              placeholder="Выберите страну"
              allowClear
              showSearch
              optionFilterProp="children"
              virtual={false}
              style={{ width: "100%" }}
            >
              {citizenships.map((c) => (
                <Option key={c.id} value={c.id}>{c.name}</Option>
              ))}
            </Select>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Область / регион</div>
            <Input
              value={localValues.birthRegion}
              onChange={(e) => setLocalValues((prev) => ({ ...prev, birthRegion: e.target.value }))}
              placeholder="Московская область"
            />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>Населённый пункт</div>
            <Input
              value={localValues.birthCity}
              onChange={(e) => setLocalValues((prev) => ({ ...prev, birthCity: e.target.value }))}
              placeholder="г. Москва"
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default BirthPlaceModal;
