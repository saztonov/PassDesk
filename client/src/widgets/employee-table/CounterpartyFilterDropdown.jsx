import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Button, Space, Checkbox, Spin } from "antd";
import { counterpartyService } from "@/services/counterpartyService";

/**
 * Компонент фильтра для колонки "Контрагент"
 * Включает поле поиска и список с чекбоксами
 */
export const CounterpartyFilterDropdown = ({
  setSelectedKeys,
  selectedKeys,
  confirm,
  clearFilters,
  uniqueFilterCounterparties = [],
  resetTrigger = 0,
}) => {
  const selectedValues = Array.isArray(selectedKeys) ? selectedKeys : [];
  const [searchText, setSearchText] = useState("");
  const [availableCounterparties, setAvailableCounterparties] = useState(
    uniqueFilterCounterparties,
  );
  const [loading, setLoading] = useState(false);
  const fallbackOptionsRef = useRef(uniqueFilterCounterparties);

  useEffect(() => {
    fallbackOptionsRef.current = uniqueFilterCounterparties;
  }, [uniqueFilterCounterparties]);

  useEffect(() => {
    let cancelled = false;

    const loadCounterparties = async () => {
      setLoading(true);

      try {
        let counterparties = [];

        try {
          const response = await counterpartyService.getAll({
            limit: 10000,
            page: 1,
          });
          counterparties =
            response?.data?.data?.counterparties ||
            response?.data?.counterparties ||
            [];
        } catch (error) {
          if (error?.response?.status && error.response.status !== 403) {
            throw error;
          }
        }

        if (counterparties.length === 0) {
          const response = await counterpartyService.getAvailable();
          counterparties = response?.data?.data || [];
        }

        if (cancelled) {
          return;
        }

        const nextOptions = counterparties
          .filter((counterparty) => counterparty?.id && counterparty?.name)
          .map((counterparty) => ({
            value: counterparty.id,
            label: counterparty.name,
          }))
          .sort((left, right) =>
            String(left.label).localeCompare(String(right.label), "ru", {
              sensitivity: "base",
              numeric: true,
            }),
          );

        setAvailableCounterparties(nextOptions);
      } catch (error) {
        if (!cancelled) {
          console.warn("Ошибка загрузки контрагентов для фильтра:", error);
          setAvailableCounterparties(fallbackOptionsRef.current);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCounterparties();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSearchText("");
  }, [resetTrigger]);

  const filteredCounterparties = useMemo(
    () =>
      availableCounterparties.filter((option) =>
        option.label.toLowerCase().includes(searchText.toLowerCase()),
      ),
    [availableCounterparties, searchText],
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
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            <Spin size="small" />
          </div>
        ) : filteredCounterparties.length > 0 ? (
          filteredCounterparties.map((option) => (
            <div key={option.value} style={{ marginBottom: "4px" }}>
              <Checkbox
                checked={selectedValues.includes(option.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedKeys([...selectedValues, option.value]);
                  } else {
                    setSelectedKeys(
                      selectedValues.filter((value) => value !== option.value),
                    );
                  }
                }}
              >
                {option.label}
              </Checkbox>
            </div>
          ))
        ) : (
          <div style={{ padding: "8px", color: "#999", textAlign: "center" }}>
            Контрагенты не найдены
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
