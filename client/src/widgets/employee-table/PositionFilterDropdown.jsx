import { useState } from "react";
import { Input, Button, Space, Checkbox } from "antd";

/**
 * Компонент фильтра для колонки "Должность"
 * Включает поле поиска и список с чекбоксами
 */
export const PositionFilterDropdown = ({
  setSelectedKeys,
  selectedKeys,
  confirm,
  clearFilters,
  uniqueFilterPositions,
  resetTrigger: _resetTrigger,
}) => {
  const [searchText, setSearchText] = useState("");

  const filteredPositions = uniqueFilterPositions.filter((pos) =>
    pos.toLowerCase().includes(searchText.toLowerCase()),
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
        placeholder="Поиск должности..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: "8px" }}
      />
      <div
        style={{ maxHeight: "200px", overflow: "auto", marginBottom: "8px" }}
      >
        {filteredPositions.map((pos) => (
          <div key={pos} style={{ marginBottom: "4px" }}>
            <Checkbox
              checked={selectedKeys.includes(pos)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedKeys([...selectedKeys, pos]);
                } else {
                  setSelectedKeys(selectedKeys.filter((v) => v !== pos));
                }
              }}
            >
              {pos}
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
