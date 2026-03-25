import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Button, Space, Checkbox, Spin } from "antd";

const FILTER_OPTIONS_TTL_MS = 5 * 60 * 1000;
const optionsCache = new Map();
const inFlightRequests = new Map();

const normalizeOptions = (options = []) =>
  options
    .map((option) =>
      typeof option === "string"
        ? { value: option, label: option }
        : {
            value: option?.value,
            label: option?.label ?? option?.value,
          },
    )
    .filter((option) => option?.value && option?.label)
    .sort((left, right) =>
      String(left.label).localeCompare(String(right.label), "ru", {
        sensitivity: "base",
        numeric: true,
      }),
    );

const loadCachedOptions = async ({ cacheKey, loadOptions }) => {
  const cached = optionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FILTER_OPTIONS_TTL_MS) {
    return cached.options;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const request = Promise.resolve(loadOptions())
    .then((result) => {
      const options = normalizeOptions(result);
      optionsCache.set(cacheKey, {
        options,
        timestamp: Date.now(),
      });
      inFlightRequests.delete(cacheKey);
      return options;
    })
    .catch((error) => {
      inFlightRequests.delete(cacheKey);
      throw error;
    });

  inFlightRequests.set(cacheKey, request);
  return request;
};

export const AsyncCheckboxFilterDropdown = ({
  setSelectedKeys,
  selectedKeys,
  confirm,
  clearFilters,
  placeholder,
  emptyText = "Ничего не найдено",
  loadOptions,
  cacheKey,
  fallbackOptions = [],
  resetTrigger = 0,
}) => {
  const selectedValues = Array.isArray(selectedKeys) ? selectedKeys : [];
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState(() => normalizeOptions(fallbackOptions));
  const loadOptionsRef = useRef(loadOptions);
  const fallbackOptionsRef = useRef(fallbackOptions);

  useEffect(() => {
    loadOptionsRef.current = loadOptions;
    fallbackOptionsRef.current = fallbackOptions;
  }, [fallbackOptions, loadOptions]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const nextOptions = await loadCachedOptions({
          cacheKey,
          loadOptions: () => loadOptionsRef.current(),
        });
        if (!cancelled) {
          setOptions(nextOptions);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(`Ошибка загрузки фильтра ${cacheKey}:`, error);
          setOptions(normalizeOptions(fallbackOptionsRef.current));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useEffect(() => {
    setSearchText("");
  }, [resetTrigger]);

  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        String(option.label).toLowerCase().includes(searchText.toLowerCase()),
      ),
    [options, searchText],
  );

  const handleReset = () => {
    setSearchText("");
    setSelectedKeys([]);
    clearFilters?.();
    confirm();
  };

  return (
    <div style={{ padding: "8px", minWidth: "250px" }}>
      <Input
        placeholder={placeholder}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        style={{ marginBottom: "8px" }}
      />
      <div
        style={{ maxHeight: "200px", overflow: "auto", marginBottom: "8px" }}
      >
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            <Spin size="small" />
          </div>
        ) : filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <div key={option.value} style={{ marginBottom: "4px" }}>
              <Checkbox
                checked={selectedValues.includes(option.value)}
                onChange={(event) => {
                  if (event.target.checked) {
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
            {emptyText}
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
