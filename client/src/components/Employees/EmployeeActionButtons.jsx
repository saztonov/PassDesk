import { useState } from "react";
import { Button, Popconfirm, Space } from "antd";
import { employeeStatusService } from "../../services/employeeStatusService";
import { invalidateCache } from "../../utils/requestCache";

const EmployeeActionButtons = ({
  employee,
  messageApi,
  onCancel,
  isDefaultCounterpartyUser,
  userRole,
  isAdmin,
  onTransfer,
}) => {
  const [loadingFire, setLoadingFire] = useState(false);
  const [loadingReinstate, setLoadingReinstate] = useState(false);

  const isFired =
    employee.statusMappings?.find((m) => m.statusGroup === "status_active")
      ?.status?.name === "status_active_fired";
  const isInactive =
    employee.statusMappings?.find((m) => m.statusGroup === "status_active")
      ?.status?.name === "status_active_inactive";
  const canManageStatuses = userRole === "admin";

  const handleFire = async () => {
    try {
      setLoadingFire(true);
      await employeeStatusService.fireEmployee(employee.id);
      invalidateCache(`employees:getById:${employee.id}`);
      messageApi.success(
        `Сотрудник ${employee.lastName} ${employee.firstName} уволен`,
      );
      setTimeout(() => {
        onCancel && onCancel();
      }, 500);
    } catch (error) {
      console.error("Error firing employee:", error);
      messageApi.error("Ошибка при увольнении сотрудника");
    } finally {
      setLoadingFire(false);
    }
  };

  const handleReinstate = async () => {
    try {
      setLoadingReinstate(true);
      await employeeStatusService.reinstateEmployee(employee.id);
      invalidateCache(`employees:getById:${employee.id}`);
      messageApi.success(
        `Сотрудник ${employee.lastName} ${employee.firstName} восстановлен`,
      );
      setTimeout(() => {
        onCancel && onCancel();
      }, 500);
    } catch (error) {
      console.error("Error reinstating employee:", error);
      messageApi.error("Ошибка при восстановлении сотрудника");
    } finally {
      setLoadingReinstate(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      setLoadingFire(true);
      await employeeStatusService.deactivateEmployee(employee.id);
      invalidateCache(`employees:getById:${employee.id}`);
      messageApi.success(
        `Сотрудник ${employee.lastName} ${employee.firstName} деактивирован`,
      );
      setTimeout(() => {
        onCancel && onCancel();
      }, 500);
    } catch (error) {
      console.error("Error deactivating employee:", error);
      messageApi.error("Ошибка при деактивации сотрудника");
    } finally {
      setLoadingFire(false);
    }
  };

  const handleActivate = async () => {
    try {
      setLoadingReinstate(true);
      await employeeStatusService.activateEmployee(employee.id);
      invalidateCache(`employees:getById:${employee.id}`);
      messageApi.success(
        `Сотрудник ${employee.lastName} ${employee.firstName} активирован`,
      );
      setTimeout(() => {
        onCancel && onCancel();
      }, 500);
    } catch (error) {
      console.error("Error activating employee:", error);
      messageApi.error("Ошибка при активации сотрудника");
    } finally {
      setLoadingReinstate(false);
    }
  };

  return (
    <Space wrap>
      {canManageStatuses &&
        (isFired ? (
          <Popconfirm
            title="Восстановить сотрудника?"
            description={`Вы уверены, что ${employee.lastName} ${employee.firstName} восстанавливается?`}
            onConfirm={handleReinstate}
            okText="Да"
            cancelText="Нет"
          >
            <Button type="primary" danger loading={loadingReinstate}>
              Принять уволенного
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title="Уволить сотрудника?"
            description={`Вы уверены, что ${employee.lastName} ${employee.firstName} увольняется?`}
            onConfirm={handleFire}
            okText="Да"
            cancelText="Нет"
          >
            <Button danger loading={loadingFire}>
              Уволить
            </Button>
          </Popconfirm>
        ))}

      {canManageStatuses &&
        (isInactive ? (
          <Popconfirm
            title="Активировать сотрудника?"
            description={`Вы уверены, что ${employee.lastName} ${employee.firstName} активируется?`}
            onConfirm={handleActivate}
            okText="Да"
            cancelText="Нет"
          >
            <Button type="primary" loading={loadingReinstate}>
              Активировать
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title="Деактивировать сотрудника?"
            description={`Вы уверены, что ${employee.lastName} ${employee.firstName} деактивируется?`}
            onConfirm={handleDeactivate}
            okText="Да"
            cancelText="Нет"
          >
            <Button type="default" loading={loadingFire}>
              Деактивировать
            </Button>
          </Popconfirm>
        ))}

      {isDefaultCounterpartyUser && (isAdmin || employee.isContractor) && (
        <Button onClick={onTransfer}>Перевести</Button>
      )}
    </Space>
  );
};

export default EmployeeActionButtons;
