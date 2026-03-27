import { Button, Checkbox, Select } from "antd";
import { SettingOutlined } from "@ant-design/icons";

const labelStyle = {
  display: "block",
  marginBottom: 8,
  fontSize: 14,
  fontWeight: 500,
};

const ApplicationRequestModalFilters = ({
  userRole,
  selectedCounterparty,
  onCounterpartyChange,
  counterpartiesLoading,
  availableCounterparties,
  selectedSite,
  onSiteChange,
  sitesLoading,
  availableSites,
  includeFired,
  onIncludeFiredChange,
  onOpenColumns,
}) => (
  <div
    style={{
      display: "flex",
      gap: 16,
      alignItems: "flex-end",
      flexWrap: "wrap",
    }}
  >
    {(userRole === "admin" || userRole === "manager") && (
      <div style={{ width: 250 }}>
        <div style={labelStyle}>Контрагент</div>
        <Select
          placeholder="Все контрагенты"
          allowClear
          value={selectedCounterparty}
          onChange={onCounterpartyChange}
          loading={counterpartiesLoading}
          showSearch
          popupMatchSelectWidth={false}
          classNames={{ popup: "counterparty-select-popup" }}
          filterOption={(input, option) => {
            const text = input.toLowerCase();
            return (
              option?.label?.toLowerCase().includes(text) ||
              option?.children?.toLowerCase().includes(text)
            );
          }}
          options={availableCounterparties.map((counterparty) => ({
            label: `${counterparty.name} (ИНН: ${counterparty.inn || "-"})`,
            value: counterparty.id,
            children: counterparty.name,
          }))}
          style={{ width: "100%" }}
        />
      </div>
    )}

    <div style={{ flex: 1, minWidth: 250 }}>
      <div style={labelStyle}>Объект строительства</div>
      <Select
        placeholder="Выберите объект (опционально)"
        allowClear
        value={selectedSite}
        onChange={onSiteChange}
        loading={sitesLoading}
        options={availableSites.map((site) => ({
          label: site.shortName || site.name,
          value: site.id,
        }))}
      />
    </div>

    <Checkbox
      checked={includeFired}
      onChange={(event) => onIncludeFiredChange(event.target.checked)}
    >
      Включить уволенных
    </Checkbox>

    <Button
      icon={<SettingOutlined />}
      onClick={onOpenColumns}
      title="Выбрать столбцы для экспорта"
    >
      Столбцы
    </Button>
  </div>
);

export default ApplicationRequestModalFilters;
