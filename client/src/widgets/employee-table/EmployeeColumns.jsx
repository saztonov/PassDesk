import { useMemo } from "react";
import { Button, Tag, Tooltip, Space, Popconfirm, Select, Badge } from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
} from "@ant-design/icons";
import { getStatusPriority } from "@/entities/employee";
import { FullNameFilterDropdown } from "./FullNameFilterDropdown";
import { CounterpartyFilterDropdown } from "./CounterpartyFilterDropdown";
import { CreatedAtFilterDropdown } from "./CreatedAtFilterDropdown";
import { DocumentExpiryStatus } from "./DocumentExpiryStatus";
import { AsyncCheckboxFilterDropdown } from "./AsyncCheckboxFilterDropdown";
import positionService from "@/services/positionService";
import { citizenshipService } from "@/services/citizenshipService";
import { constructionSiteService } from "@/services/constructionSiteService";
import { departmentApi } from "@/entities/department";

const getEmployeeMappings = (record) =>
  Array.isArray(record?.employeeCounterpartyMappings)
    ? record.employeeCounterpartyMappings
    : [];

const isDismissedMapping = (mapping) => Boolean(mapping?.dismissedAt);

const getActiveEmployeeMappings = (record) =>
  getEmployeeMappings(record).filter((mapping) => !isDismissedMapping(mapping));

const getDismissedEmployeeMappings = (record) =>
  getEmployeeMappings(record).filter((mapping) => isDismissedMapping(mapping));

const getUniqueMappingValues = (mappings, selector) => [
  ...new Set(mappings.map(selector).filter(Boolean)),
];

const getEmployeeUploadState = (record) => {
  const activeStatusMappings = Array.isArray(record?.statusMappings)
    ? record.statusMappings.filter((mapping) => mapping?.isActive !== false)
    : [];

  if (activeStatusMappings.length === 0) {
    return null;
  }

  return activeStatusMappings.every((mapping) => mapping?.isUpload)
    ? "uploaded"
    : "not_uploaded";
};

const renderMappingState = ({
  activeValues = [],
  dismissedValues = [],
  emptyText = "-",
}) => {
  if (!activeValues.length && !dismissedValues.length) {
    return emptyText;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        whiteSpace: "normal",
        wordBreak: "keep-all",
        overflowWrap: "break-word",
        lineHeight: "1.4",
      }}
    >
      {activeValues.length > 0 && (
        <div>
          <span style={{ color: "#8c8c8c" }}>Работает:</span>{" "}
          <span>{activeValues.join(", ")}</span>
        </div>
      )}
      {dismissedValues.length > 0 && (
        <div>
          <span style={{ color: "#d46b08" }}>Уволен из:</span>{" "}
          <span>{dismissedValues.join(", ")}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Создание конфигурации колонок для таблицы сотрудников
 * Мемоизировано для предотвращения лишних ререндеров
 */
export const useEmployeeColumns = ({
  departments,
  onEdit,
  onView,
  onDelete,
  onViewFiles,
  onDepartmentChange,
  canExport: _canExport,
  showDepartmentColumn,
  showCounterpartyColumn, // Новый параметр для показа столбца "Контрагент"
  canDeleteEmployee,
  canMarkForDeletion,
  onMarkForDeletion,
  uniqueFilters: _uniqueFilters,
  filterOptions,
  filters = {}, // Состояние фильтров из localStorage
  onConstructionSitesEdit, // Новый callback для редактирования объектов
  resetTrigger = 0, // Триггер для сброса фильтров
  currentSortBy,
  currentSortOrder,
}) => {
  return useMemo(() => {
    const getSortOrder = (columnKey) => {
      if (currentSortBy !== columnKey) {
        return null;
      }

      return currentSortOrder === "ASC"
        ? "ascend"
        : currentSortOrder === "DESC"
          ? "descend"
          : null;
    };

    const serverSorter = (columnKey) => ({
      sorter: true,
      sortOrder: getSortOrder(columnKey),
    });

    const columns = [
      {
        title: "№",
        key: "index",
        width: 55,
        align: "center",
        render: (text, record, index) => index + 1,
      },
      {
        title: "ФИО",
        key: "fullName",
        width: 230,
        render: (_, record) => (
          <div
            style={{
              whiteSpace: "normal",
              wordBreak: "normal",
              overflowWrap: "break-word",
            }}
          >
            {record.lastName} {record.firstName} {record.middleName || ""}
            {record.markedForDeletion && (
              <Tag color="red" style={{ marginLeft: 6 }}>
                🗑️
              </Tag>
            )}
          </div>
        ),
        filterDropdown: (props) => (
          <FullNameFilterDropdown
            key={`full-name-filter-${resetTrigger}`}
            {...props}
            uniqueFilterFullNames={filterOptions.fullNames}
            resetTrigger={resetTrigger}
            selectedCounterparties={filters.counterparty}
          />
        ),
        filterIcon: (filtered) => (
          <div style={{ color: filtered ? "#1890ff" : undefined }}>☰</div>
        ),
        filteredValue: filters.fullName || [],
      },
      {
        title: "Должность",
        dataIndex: ["position", "name"],
        key: "position",
        width: 186,
        ellipsis: false,
        render: (name) => (
          <div
            style={{
              whiteSpace: "normal",
              wordBreak: "keep-all",
              overflowWrap: "break-word",
              lineHeight: "1.4",
            }}
          >
            {name || "-"}
          </div>
        ),
        ...serverSorter("position"),
        filterDropdown: (props) => (
          <AsyncCheckboxFilterDropdown
            key={`position-filter-${resetTrigger}`}
            {...props}
            resetTrigger={resetTrigger}
            placeholder="Поиск должности..."
            emptyText="Должности не найдены"
            cacheKey="employee-filter:positions"
            fallbackOptions={filterOptions.positions}
            loadOptions={async () => {
              const response = await positionService.getAll({ limit: 10000 });
              const positions = response?.data?.data?.positions || [];
              return positions.map((position) => position?.name).filter(Boolean);
            }}
          />
        ),
        filterIcon: (filtered) => (
          <div style={{ color: filtered ? "#1890ff" : undefined }}>☰</div>
        ),
        filteredValue: filters.position || [],
      },
      // Столбец "Подразделение" видно ТОЛЬКО для пользователей контрагента по умолчанию
      ...(showDepartmentColumn
        ? [
            {
              title: "Подразделение",
              key: "department",
              width: 180,
              ellipsis: false,
              render: (_, record) => {
                const activeMappings = getActiveEmployeeMappings(record);
                const dismissedMappings = getDismissedEmployeeMappings(record);
                const currentMapping = activeMappings[0] || dismissedMappings[0];
                const currentDepartmentId = currentMapping?.departmentId;
                const currentDepartmentName = currentMapping?.department?.name;

                return (
                  <Select
                    value={
                      currentDepartmentId
                        ? {
                            label: currentDepartmentName,
                            value: currentDepartmentId,
                          }
                        : undefined
                    }
                    placeholder="Выберите подразделение"
                    style={{ width: "100%" }}
                    className="department-select"
                    popupMatchSelectWidth={false}
                    onChange={(option) =>
                      onDepartmentChange(record.id, option?.value || null)
                    }
                    allowClear
                    showSearch
                    optionFilterProp="children"
                    filterOption={(input, option) =>
                      option.children
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    labelInValue
                  >
                    {departments.map((dept) => (
                      <Select.Option
                        key={dept.id}
                        value={dept.id}
                        label={dept.name}
                      >
                        {dept.name}
                      </Select.Option>
                    ))}
                  </Select>
                );
              },
              ...serverSorter("department"),
              filterDropdown: (props) => (
                <AsyncCheckboxFilterDropdown
                  key={`department-filter-${resetTrigger}`}
                  {...props}
                  resetTrigger={resetTrigger}
                  placeholder="Поиск подразделения..."
                  emptyText="Подразделения не найдены"
                  cacheKey="employee-filter:departments"
                  fallbackOptions={(departments || [])
                    .map((department) => department?.name)
                    .filter(Boolean)}
                  loadOptions={async () => {
                    const response = await departmentApi.getAll();
                    const availableDepartments =
                      response?.data?.departments || response?.departments || [];
                    return availableDepartments
                      .map((department) => department?.name)
                      .filter(Boolean);
                  }}
                />
              ),
              filteredValue: filters.department || [],
            },
          ]
        : []),
      // Столбец "Контрагент" виден для пользователей с правом экспорта и для пользователей с субподрядчиками
      ...(showCounterpartyColumn
        ? [
            {
              title: "Контрагент",
              key: "counterparty",
              width: 168,
              ellipsis: false,
              render: (_, record) => {
                const activeCounterparties = getUniqueMappingValues(
                  getActiveEmployeeMappings(record),
                  (mapping) => mapping.counterparty?.name,
                );
                const dismissedCounterparties = getUniqueMappingValues(
                  getDismissedEmployeeMappings(record),
                  (mapping) => mapping.counterparty?.name,
                );

                return renderMappingState({
                  activeValues: activeCounterparties,
                  dismissedValues: dismissedCounterparties,
                });
              },
              ...serverSorter("counterparty"),
              filterDropdown: (props) => (
                <CounterpartyFilterDropdown
                  key={`counterparty-filter-${resetTrigger}`}
                  {...props}
                  uniqueFilterCounterparties={filterOptions.counterparties}
                  resetTrigger={resetTrigger}
                />
              ),
              filterIcon: (filtered) => (
                <div style={{ color: filtered ? "#1890ff" : undefined }}>
                  ☰
                </div>
              ),
              filteredValue: filters.counterparty || [],
            },
          ]
        : []),
      {
        title: "Объект",
        key: "constructionSite",
        width: 150,
        render: (_, record) => {
          const activeSiteMappings = getActiveEmployeeMappings(record).filter(
            (mapping) => mapping.constructionSite,
          );
          const dismissedSiteMappings = getDismissedEmployeeMappings(record).filter(
            (mapping) => mapping.constructionSite,
          );

          if (activeSiteMappings.length === 0 && dismissedSiteMappings.length === 0) {
            return (
              <Button
                type="text"
                size="small"
                onClick={() =>
                  onConstructionSitesEdit && onConstructionSitesEdit(record)
                }
                style={{ padding: "0 4px", color: "#1890ff" }}
              >
                + Выбрать
              </Button>
            );
          }

          return (
            <div
              onClick={() =>
                onConstructionSitesEdit && onConstructionSitesEdit(record)
              }
              onKeyDown={(event) => {
                if (
                  onConstructionSitesEdit &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  onConstructionSitesEdit(record);
                }
              }}
              role="button"
              tabIndex={0}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                whiteSpace: "normal",
                wordBreak: "normal",
                overflowWrap: "break-word",
                cursor: "pointer",
                padding: "4px 8px",
                marginLeft: "-8px",
                marginRight: "-8px",
                borderRadius: "2px",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f5f5f5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {renderMappingState({
                activeValues: getUniqueMappingValues(
                  activeSiteMappings,
                  (mapping) =>
                    mapping.constructionSite?.shortName ||
                    mapping.constructionSite?.name,
                ),
                dismissedValues: getUniqueMappingValues(
                  dismissedSiteMappings,
                  (mapping) =>
                    mapping.constructionSite?.shortName ||
                    mapping.constructionSite?.name,
                ),
              })}
            </div>
          );
        },
        ...serverSorter("constructionSite"),
        filterDropdown: (props) => (
          <AsyncCheckboxFilterDropdown
            key={`construction-site-filter-${resetTrigger}`}
            {...props}
            resetTrigger={resetTrigger}
            placeholder="Поиск объекта..."
            emptyText="Объекты не найдены"
            cacheKey="employee-filter:construction-sites"
            fallbackOptions={filterOptions.constructionSites}
            loadOptions={async () => {
              const labels = [];
              let page = 1;
              let totalPages = 1;

              while (page <= totalPages) {
                const response = await constructionSiteService.getAll({
                  limit: 100,
                  page,
                });
                const payload = response?.data?.data || {};
                const sites = Array.isArray(payload.constructionSites)
                  ? payload.constructionSites
                  : [];

                labels.push(
                  ...sites
                    .map((site) =>
                      String(site?.shortName || site?.name || site?.fullName || "").trim(),
                    )
                    .filter(Boolean),
                );

                totalPages = Number(payload.pagination?.pages || 1);
                page += 1;
              }

              return labels;
            }}
          />
        ),
        filteredValue: filters.constructionSite || [],
      },
      {
        title: "Гражданство",
        dataIndex: ["citizenship", "name"],
        key: "citizenship",
        width: 150,
        ellipsis: true,
        render: (name) => name || "-",
        ...serverSorter("citizenship"),
        filterDropdown: (props) => (
          <AsyncCheckboxFilterDropdown
            key={`citizenship-filter-${resetTrigger}`}
            {...props}
            resetTrigger={resetTrigger}
            placeholder="Поиск гражданства..."
            emptyText="Гражданства не найдены"
            cacheKey="employee-filter:citizenships"
            fallbackOptions={filterOptions.citizenships}
            loadOptions={async () => {
              const response = await citizenshipService.getAll();
              const citizenships = response?.data?.data?.citizenships || [];
              return citizenships
                .map((citizenship) => citizenship?.name)
                .filter(Boolean);
            }}
          />
        ),
        filteredValue: filters.citizenship || [],
      },
      {
        title: "ЗУП",
        key: "isUpload",
        width: 96,
        align: "center",
        render: (_, record) => {
          const uploadState = getEmployeeUploadState(record);

          if (uploadState === "uploaded") {
            return <Tag color="green">ДА</Tag>;
          }

          if (uploadState === "not_uploaded") {
            return <Tag color="orange">НЕТ</Tag>;
          }

          return "-";
        },
        filters: [
          { text: "ДА (выгружен)", value: "uploaded" },
          { text: "НЕТ (не выгружен)", value: "not_uploaded" },
        ],
        filteredValue: filters.isUpload || [],
      },
      {
        title: "Заполнен",
        key: "statusCard",
        width: 130,
        align: "center",
        render: (_, record) => {
          const isCompleted = record.statusCard === "completed";

          return (
            <Tooltip
              title={
                isCompleted
                  ? "Все обязательные поля заполнены"
                  : "Не все обязательные поля заполнены"
              }
            >
              {isCompleted ? (
                <CheckCircleFilled style={{ fontSize: 20, color: "#52c41a" }} />
              ) : (
                <CloseCircleFilled style={{ fontSize: 20, color: "#ff4d4f" }} />
              )}
            </Tooltip>
          );
        },
        ...serverSorter("statusCard"),
        filters: [
          { text: "Заполнен", value: "completed" },
          { text: "Не заполнен", value: "draft" },
        ],
        filteredValue: filters.statusCard || [],
      },
      {
        title: "Дата создания",
        key: "createdAt",
        width: 120,
        render: (_, record) => {
          if (!record.createdAt) return "-";
          const date = new Date(record.createdAt);
          return date.toLocaleDateString("ru-RU");
        },
        ...serverSorter("createdAt"),
        filterDropdown: (props) => (
          <CreatedAtFilterDropdown {...props} resetTrigger={resetTrigger} />
        ),
        filterIcon: (filtered) => (
          <div style={{ color: filtered ? "#1890ff" : undefined }}>☰</div>
        ),
        filteredValue: filters.createdAt || [],
      },
      {
        title: "Файлы",
        key: "files",
        width: 80,
        align: "center",
        render: (_, record) => {
          const filesCount = record.filesCount || 0;
          return (
            <Tooltip
              title={
                filesCount > 0
                  ? `Просмотр файлов (${filesCount})`
                  : "Нет файлов"
              }
            >
              <Badge
                count={filesCount > 0 ? filesCount : 0}
                offset={[-8, 4]}
                style={{
                  backgroundColor: filesCount > 0 ? "#ff7a45" : "#d9d9d9",
                  fontSize: "10px",
                  height: "16px",
                  lineHeight: "16px",
                  minWidth: "16px",
                  padding: "0 3px",
                }}
              >
                <Button
                  type="text"
                  icon={<FileOutlined />}
                  onClick={() => onViewFiles(record)}
                  disabled={filesCount === 0}
                  style={{
                    color: filesCount > 0 ? "#1890ff" : "#d9d9d9",
                    padding: "4px 8px",
                  }}
                />
              </Badge>
            </Tooltip>
          );
        },
        ...serverSorter("files"),
      },
      {
        title: "Срок действия док.",
        key: "documentExpiry",
        width: 100,
        align: "center",
        render: (_, record) => <DocumentExpiryStatus employee={record} />,
        filters: [
          { text: "🔴 Истек", value: "expired" },
          { text: "🟠 Осталось ≤ 2 недели", value: "expiring-soon" },
          { text: "🟢 В норме", value: "valid" },
          { text: "-  Нет данных", value: "no-data" },
        ],
        filteredValue: filters.documentExpiry || [],
      },
      {
        title: "Статус",
        key: "status",
        width: 120,
        render: (_, record) => {
          // Получаем текущие статусы из маппинга
          const statusMappings = record.statusMappings || [];

          // Функция для получения статуса по группе
          // API возвращает snake_case поля: status_group, status.name
          // Также поддерживаем старые неправильные группы из импорта (draft, card draft)
          const getStatusByGroup = (group, alternativeGroups = []) => {
            const groupsToCheck = [group, ...alternativeGroups];
            const mapping = statusMappings.find((m) => {
              const mappingGroup = m.statusGroup || m.status_group;
              return groupsToCheck.includes(mappingGroup) && m.isActive !== false;
            });
            if (!mapping) return null;
            // Статус может быть в status или Status
            const statusObj = mapping.status || mapping.Status;
            return statusObj?.name;
          };

          // Приоритет: status_secure (Заблокирован) > status_active (Уволен/Неактивный) > status_card (Черновик) > status (Новый/Проведен ТБ/Обработан)
          const secureStatus = getStatusByGroup("status_secure");
          const activeStatus = getStatusByGroup("status_active");
          // Проверяем группу status_card и старую неправильную группу 'card draft'
          const cardStatus = getStatusByGroup("status_card", ["card draft"]);
          // Проверяем группу status и старую неправильную группу 'draft'
          const mainStatus = getStatusByGroup("status", ["draft"]);

          if (
            secureStatus === "status_secure_block" ||
            secureStatus === "status_secure_block_compl"
          ) {
            return <Tag color="red">Заблокирован</Tag>;
          }

          if (
            activeStatus === "status_active_fired" ||
            activeStatus === "status_active_fired_compl"
          ) {
            return <Tag color="red">Уволен</Tag>;
          }
          if (activeStatus === "status_active_inactive") {
            return <Tag color="blue">Неактивный</Tag>;
          }

          // Проверяем черновик - может быть в группе status_card или status
          if (
            cardStatus === "status_card_draft" ||
            mainStatus === "status_draft"
          ) {
            return <Tag color="default">Черновик</Tag>;
          }

          const statusMap = {
            status_new: { text: "Действующий", color: "green" },
            status_tb_passed: { text: "Действующий", color: "green" },
            status_processed: { text: "Действующий", color: "success" },
          };

          const statusInfo = statusMap[mainStatus] || {
            text: "-",
            color: "default",
          };
          return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
        },
        ...serverSorter("status"),
        filters: [
          { text: "Заблокирован", value: "blocked" },
          { text: "Уволен", value: "fired" },
          { text: "Неактивный", value: "inactive" },
          { text: "Черновик", value: "draft" },
          { text: "Действующий", value: "active" },
        ],
        filteredValue: filters.status || [],
      },
      {
        title: "Действия",
        key: "actions",
        width: 150,
        fixed: "right",
        render: (_, record) => (
          <Space>
            <Tooltip title="Просмотр">
              <Button
                type="text"
                icon={<EyeOutlined />}
                onClick={() => onView(record)}
              />
            </Tooltip>
            <Tooltip title="Редактировать">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
              />
            </Tooltip>
            {canDeleteEmployee && canDeleteEmployee(record) && (
              <Tooltip title="Удалить">
                <Popconfirm
                  title="Удалить сотрудника?"
                  description="Это действие нельзя отменить."
                  onConfirm={() => onDelete(record.id)}
                  okText="Удалить"
                  okType="danger"
                  cancelText="Отмена"
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Tooltip>
            )}
            {canMarkForDeletion &&
              canMarkForDeletion(record) &&
              !record.markedForDeletion && (
                <Tooltip title="На удаление">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => onMarkForDeletion(record)}
                  />
                </Tooltip>
              )}
          </Space>
        ),
      },
    ];

    return columns;
  }, [
    departments,
    onEdit,
    onView,
    onDelete,
    onViewFiles,
    onDepartmentChange,
    canDeleteEmployee,
    filterOptions,
    filters,
    showDepartmentColumn,
    showCounterpartyColumn,
    onConstructionSitesEdit,
    resetTrigger,
    canMarkForDeletion,
    onMarkForDeletion,
    currentSortBy,
    currentSortOrder,
  ]);
};
