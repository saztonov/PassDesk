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

  const filteredCounterparties = uniqueFilterCounterparties.filter((option) =>
    option.label.toLowerCase().includes(searchText.toLowerCase()),
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
        {filteredCounterparties.map((option) => (
          <div key={option.value} style={{ marginBottom: "4px" }}>
            <Checkbox
              checked={selectedKeys.includes(option.value)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedKeys([...selectedKeys, option.value]);
                } else {
                  setSelectedKeys(
                    selectedKeys.filter((value) => value !== option.value),
                  );
                }
              }}
            >
              {option.label}
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
