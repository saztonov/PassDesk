import { Button, Popconfirm, Space, Typography } from "antd";
import { canManageEmployeeStatuses } from "@/shared/lib/accessControl";

const { Title } = Typography;

export const buildMobileEmployeeStatusSection = ({
  employee,
  user,
  defaultCounterpartyId: _defaultCounterpartyId,
  fireLoading,
  activateLoading,
  onFire,
  onReinstate,
  onDeactivate: _onDeactivate,
  onActivate,
}) => {
  if (!employee?.id || !canManageEmployeeStatuses(user?.role)) {
    return null;
  }

  const activeStatusName =
    employee.statusMappings?.find((mapping) => mapping.statusGroup === "status_active")
      ?.status?.name || null;
  const isFired = activeStatusName === "status_active_fired";
  const isInactive = activeStatusName === "status_active_inactive";

  return {
    key: "statuses",
    label: (
      <Title level={5} style={{ margin: 0 }}>
        ⚙️ Статусы
      </Title>
    ),
    children: (
      <Space direction="vertical" style={{ width: "100%" }}>
        {isFired ? (
          <Popconfirm
            title="Восстановить сотрудника?"
            description={`Вы уверены, что ${employee.lastName} ${employee.firstName} восстанавливается?`}
            onConfirm={onReinstate}
            okText="Да"
            cancelText="Нет"
          >
            <Button type="primary" danger block loading={activateLoading}>
              Принять уволенного
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title="Уволить сотрудника?"
            description={`Вы уверены, что ${employee.lastName} ${employee.firstName} увольняется?`}
            onConfirm={onFire}
            okText="Да"
            cancelText="Нет"
          >
            <Button danger block loading={fireLoading}>
              Уволить
            </Button>
          </Popconfirm>
        )}

        {isInactive ? (
          <Popconfirm
            title="Активировать сотрудника?"
            description={`Вы уверены, что ${employee.lastName} ${employee.firstName} активируется?`}
            onConfirm={onActivate}
            okText="Да"
            cancelText="Нет"
          >
            <Button type="primary" block loading={activateLoading}>
              Активировать
            </Button>
          </Popconfirm>
        ) : null}

        {/* Временно скрыто по требованию: кнопка деактивации в карточке сотрудника (mobile) */}
        {/*
          {!isInactive && user?.counterpartyId !== defaultCounterpartyId && (
            <Popconfirm
              title="Сотрудник не работает на объектах СУ-10?"
              description={`Вы уверены, что ${employee.lastName} ${employee.firstName} не работает на объектах СУ-10?`}
              onConfirm={onDeactivate}
              okText="Да"
              cancelText="Нет"
            >
              <Button type="default" block loading={fireLoading}>
                Не работает на объектах СУ-10
              </Button>
            </Popconfirm>
          )}
        */}
      </Space>
    ),
  };
};
