import { useState } from "react";
import { Input, Button, Space, Checkbox } from "antd";

/**
 * Компонент фильтра для колонки "Контрагент"
 * Включает поле поиска и список с чекбоксами
 */
export const CounterpartyFilterDropdown = ({
  setSelectedKeys,
  selectedKeys,
  confirm,
  clearFilters,
  uniqueFilterCounterparties,
  resetTrigger: _resetTrigger,
}) => {
  const [searchText, setSearchText] = useState("");

  const filteredCounterparties = uniqueFilterCounterparties.filter((name) =>
    name.toLowerCase().includes(searchText.toLowerCase()),
  );

  const handleReset = () => {
    setSearchText("");
    setSelectedKeys([]);
    clearFilters();
    confirm();
  };

  return (
    <div style={{ padding: "8px", minWidth: "250px" }}>
      <Input
        placeholder="Поиск по контрагенту..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: "8px" }}
      />
      <div
        style={{ maxHeight: "200px", overflow: "auto", marginBottom: "8px" }}
      >
        {filteredCounterparties.map((name) => (
          <div key={name} style={{ marginBottom: "4px" }}>
            <Checkbox
              checked={selectedKeys.includes(name)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedKeys([...selectedKeys, name]);
                } else {
                  setSelectedKeys(selectedKeys.filter((v) => v !== name));
                }
              }}
            >
              {name}
            </Checkbox>
          </div>
        ))}
      </div>
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Button type="primary" onClick={() => confirm()} size="small">
          OK
        </Button>
        <Button onClick={handleReset} size="small">
          Сброс
        </Button>
      </Space>
    </div>
  );
};
