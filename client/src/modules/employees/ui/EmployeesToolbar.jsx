import { memo } from "react";
import {
  Button,
  Checkbox,
  Dropdown,
  Grid,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ClearOutlined,
  MoreOutlined,
  PlusOutlined,
  SyncOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { EmployeeSearchFilter } from "@/features/employee-search";
import { EmployeeActions } from "@/features/employee-actions";

const { Title } = Typography;
const { useBreakpoint } = Grid;

const EmployeesToolbar = memo(
  ({ isMobile, t, view, filters, columns, actions }) => {
    const screens = useBreakpoint();
    const isTabletLayout = !isMobile && !screens.xl;

    const columnsPopup = (
      <div
        style={{
          padding: 12,
          background: "#fff",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          minWidth: 220,
        }}
      >
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          {columns.availableColumns.map((column) => (
            <Checkbox
              key={column.key}
              checked={!columns.hiddenColumns.includes(column.key)}
              onChange={() => columns.onToggleColumn(column.key)}
            >
              {column.label}
            </Checkbox>
          ))}
          <Button size="small" onClick={columns.onResetColumns}>
            Сбросить
          </Button>
        </Space>
      </div>
    );

    return (
      <>
        {!isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 12,
              backgroundColor: "#fff",
              padding: "16px",
              borderBottom: "1px solid #f0f0f0",
              flexShrink: 0,
              marginBottom: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
              }}
            >
              <TeamOutlined />
              <Title level={3} style={{ margin: 0, whiteSpace: "nowrap" }}>
                {t("employees.title")}
              </Title>
              {view.backgroundLoading ? (
                <Tooltip
                  title={`Загрузка данных... (${view.loadedEmployeesCount} из ${view.totalCount})`}
                >
                  <SyncOutlined
                    spin
                    style={{ color: "#1890ff", fontSize: 16 }}
                  />
                </Tooltip>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                columnGap: 12,
                rowGap: 10,
              }}
            >
              <div
                style={{
                  flex: "1 1 320px",
                  minWidth: isTabletLayout ? 220 : 280,
                  maxWidth: "100%",
                }}
              >
                <EmployeeSearchFilter
                  searchText={filters.searchText}
                  onSearchChange={filters.onSearchTextChange}
                  statusFilter={filters.statusFilter}
                  onStatusFilterChange={filters.onStatusFilterChange}
                  compact={isTabletLayout}
                />
              </div>

              <Button
                type="text"
                danger
                icon={<ClearOutlined />}
                onClick={filters.onResetFilters}
                title={t("common.reset")}
                style={{ flex: "0 0 auto" }}
              >
                {t("common.reset")}
              </Button>

              <div style={{ display: "flex", flex: "0 1 auto", minWidth: 0 }}>
                <EmployeeActions
                  onAdd={actions.onAdd}
                  onRequest={actions.onRequest}
                  onImport={actions.onImport}
                  onSecurity={actions.onSecurity}
                  canExport={view.canExport}
                  compact={isTabletLayout}
                />
              </div>

              <Dropdown trigger={["click"]} popupRender={() => columnsPopup}>
                <Button
                  type="default"
                  icon={<MoreOutlined />}
                  style={{ flex: "0 0 auto" }}
                />
              </Dropdown>
            </div>

            {Array.isArray(filters.activeFilters) &&
            filters.activeFilters.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {filters.activeFilters.map((activeFilter) => (
                  <Tag
                    key={activeFilter.id}
                    color="blue"
                    closable
                    onClose={(event) => {
                      event.preventDefault();
                      filters.onRemoveActiveFilter?.(activeFilter);
                    }}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {activeFilter.label}
                  </Tag>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {isMobile ? (
          <div
            style={{
              marginBottom: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "0 16px 12px 16px",
              flexShrink: 0,
            }}
          >
            <EmployeeSearchFilter
              searchText={filters.searchText}
              onSearchChange={filters.onSearchTextChange}
              statusFilter={filters.statusFilter}
              onStatusFilterChange={filters.onStatusFilterChange}
            />
            {Array.isArray(filters.activeFilters) &&
            filters.activeFilters.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {filters.activeFilters.map((activeFilter) => (
                  <Tag
                    key={activeFilter.id}
                    color="blue"
                    closable
                    onClose={(event) => {
                      event.preventDefault();
                      filters.onRemoveActiveFilter?.(activeFilter);
                    }}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {activeFilter.label}
                  </Tag>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 12 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={actions.onAdd}
                size="large"
                style={{ flex: 1 }}
              >
                {t("common.add")}
              </Button>
            </div>
          </div>
        ) : null}
      </>
    );
  },
);

EmployeesToolbar.displayName = "EmployeesToolbar";

export default EmployeesToolbar;
