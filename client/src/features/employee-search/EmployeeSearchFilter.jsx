import { Input, Grid, Button, Dropdown } from "antd";
import {
  SearchOutlined,
  FilterOutlined,
  CheckOutlined,
} from "@ant-design/icons";

const { useBreakpoint } = Grid;

/**
 * Feature: Фильтрация сотрудников по поисковому запросу и статусу
 * Адаптивная ширина: 100% на мобильных, 350px на десктопе
 */
export const EmployeeSearchFilter = ({
  searchText,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  compact = false,
}) => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const useCompactLayout = isMobile || compact;

  // Нормализация значения: удаление черточек, тире, минусов и пробелов на конце/начале
  const handleSearchChange = (value) => {
    const normalized = value.replace(/[-–—]/g, "").trim();
    onSearchChange(normalized);
  };

  // Опции фильтра по статусу
  const statusFilterItems = [
    {
      key: "all",
      label: (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Все статусы</span>
          {!statusFilter && <CheckOutlined style={{ color: "#1890ff" }} />}
        </div>
      ),
    },
    {
      key: "active",
      label: (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Действующий</span>
          {statusFilter === "active" && (
            <CheckOutlined style={{ color: "#1890ff" }} />
          )}
        </div>
      ),
    },
    {
      key: "draft",
      label: (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Черновик</span>
          {statusFilter === "draft" && (
            <CheckOutlined style={{ color: "#1890ff" }} />
          )}
        </div>
      ),
    },
    {
      key: "processed",
      label: (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Отправленные</span>
          {statusFilter === "processed" && (
            <CheckOutlined style={{ color: "#1890ff" }} />
          )}
        </div>
      ),
    },
    {
      key: "fired",
      label: (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Уволен</span>
          {statusFilter === "fired" && (
            <CheckOutlined style={{ color: "#1890ff" }} />
          )}
        </div>
      ),
    },
    {
      key: "inactive",
      label: (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Неактивный</span>
          {statusFilter === "inactive" && (
            <CheckOutlined style={{ color: "#1890ff" }} />
          )}
        </div>
      ),
    },
  ];

  const handleStatusFilterChange = ({ key }) => {
    onStatusFilterChange(key === "all" ? null : key);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        width: useCompactLayout ? "100%" : "auto",
        flex: useCompactLayout ? 1 : "auto",
      }}
    >
      <Input
        placeholder="Поиск по ФИО, должности, ИНН, СНИЛС..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => handleSearchChange(e.target.value)}
        style={{
          width: useCompactLayout ? "100%" : 350,
          flex: useCompactLayout ? 1 : "auto",
        }}
        allowClear
      />

      {isMobile && (
        <Dropdown
          menu={{ items: statusFilterItems, onClick: handleStatusFilterChange }}
          placement="bottomRight"
        >
          <Button
            icon={<FilterOutlined />}
            type={statusFilter ? "primary" : "default"}
            style={{ height: 40 }}
          >
            {!statusFilter ? "▼" : ""}
          </Button>
        </Dropdown>
      )}
    </div>
  );
};
