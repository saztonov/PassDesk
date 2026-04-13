import { useEffect, useMemo, useState } from "react";
import { Input, Button, Space, Checkbox } from "antd";

const EMPTY_SELECTED_COUNTERPARTIES = [];

/**
 * Компонент фильтра для колонки "ФИО"
 * Включает поле поиска и список с чекбоксами
 * Показывает только ФИО сотрудников выбранных контрагентов (если они выбраны)
 */
export const FullNameFilterDropdown = ({
  setSelectedKeys,
  selectedKeys,
  confirm,
  clearFilters,
  uniqueFilterFullNames,
  resetTrigger = 0,
  selectedCounterparties = EMPTY_SELECTED_COUNTERPARTIES,
}) => {
  const selectedValues = Array.isArray(selectedKeys) ? selectedKeys : [];
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    setSearchText("");
  }, [resetTrigger]);

  const filteredFullNames = useMemo(
    () => {
      const availableFullNames = Array.isArray(uniqueFilterFullNames)
        ? uniqueFilterFullNames
        : [];
      return availableFullNames.filter((name) =>
        name.toLowerCase().includes(searchText.toLowerCase()),
      );
    },
    [uniqueFilterFullNames, searchText],
  );

  const handleReset = () => {
    setSearchText("");
    setSelectedKeys([]);
    clearFilters?.();
    confirm();
  };

  // Показываем подсказку если контрагенты не выбраны
  const showHint = selectedCounterparties && selectedCounterparties.length > 0;

  return (
    <div style={{ padding: "8px", minWidth: "250px" }}>
      {showHint && (
        <div
          style={{
            padding: "8px",
            marginBottom: "8px",
            backgroundColor: "#e6f7ff",
            borderRadius: "4px",
            fontSize: "12px",
            color: "#0050b3",
          }}
        >
          ℹ️ Показаны только сотрудники выбранного контрагента
        </div>
      )}
      <Input
        placeholder="Поиск по ФИО..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ marginBottom: "8px" }}
      />
      <div
        style={{ maxHeight: "200px", overflow: "auto", marginBottom: "8px" }}
      >
        {filteredFullNames.length > 0 ? (
          filteredFullNames.map((name) => (
            <div key={name} style={{ marginBottom: "4px" }}>
              <Checkbox
                checked={selectedValues.includes(name)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedKeys([...selectedValues, name]);
                  } else {
                    setSelectedKeys(selectedValues.filter((v) => v !== name));
                  }
                }}
              >
                {name}
              </Checkbox>
            </div>
          ))
        ) : (
          <div style={{ padding: "8px", color: "#999", textAlign: "center" }}>
            {showHint ? "Нет сотрудников у выбранного контрагента" : "Нет сотрудников"}
          </div>
        )}
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
