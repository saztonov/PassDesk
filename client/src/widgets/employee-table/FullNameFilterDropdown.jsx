import { useEffect, useMemo, useState } from "react";
import { Input, Button, Space, Checkbox, Spin } from "antd";
import { employeeApi } from "@/entities/employee/api/employeeApi";

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
  resetTrigger: _resetTrigger,
  selectedCounterparties = EMPTY_SELECTED_COUNTERPARTIES,
}) => {
  const [searchText, setSearchText] = useState("");
  const [availableFullNames, setAvailableFullNames] = useState(
    uniqueFilterFullNames,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadFullNames = async () => {
      setLoading(true);
      try {
        const response = await employeeApi.search("", {
          ...(selectedCounterparties.length > 0
            ? {
                counterpartyIds: JSON.stringify(selectedCounterparties),
              }
            : {}),
        });
        if (cancelled) {
          return;
        }

        const nextFullNames = [
          ...new Set(
            (response?.data?.employees || [])
              .map((employee) =>
                [
                  employee?.lastName,
                  employee?.firstName,
                  employee?.middleName || "",
                ]
                  .filter(Boolean)
                  .join(" ")
                  .trim(),
              )
              .filter(Boolean),
          ),
        ].sort((left, right) =>
          left.localeCompare(right, "ru", {
            sensitivity: "base",
            numeric: true,
          }),
        );

        setAvailableFullNames(nextFullNames);
      } catch (error) {
        if (!cancelled) {
          console.warn("Ошибка загрузки списка сотрудников для фильтра ФИО:", error);
          setAvailableFullNames(uniqueFilterFullNames);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadFullNames();

    return () => {
      cancelled = true;
    };
  }, [selectedCounterparties, uniqueFilterFullNames]);

  const filteredFullNames = useMemo(
    () =>
      availableFullNames.filter((name) =>
        name.toLowerCase().includes(searchText.toLowerCase()),
      ),
    [availableFullNames, searchText],
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
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            <Spin size="small" />
          </div>
        ) : filteredFullNames.length > 0 ? (
          filteredFullNames.map((name) => (
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
