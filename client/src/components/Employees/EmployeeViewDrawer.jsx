import { Drawer, Form, Collapse, Button, Space } from "antd";
import { CloseOutlined, EditOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useEmployeeForm } from "./useEmployeeForm";
import { canManageEmployeeStatuses } from "@/shared/lib/accessControl";
import EmployeeChangeHistoryTab from "@/modules/employees/ui/EmployeeChangeHistoryTab";
import { doesEmployeeRequirePatent } from "@/modules/employees/lib/patentRequirement";
import {
  buildEmployeeViewDrawerFormData,
  buildEmployeeViewDrawerItems,
} from "./EmployeeViewDrawerSections";

/**
 * Боковая панель просмотра сотрудника (только чтение)
 * Используется на мобильных устройствах
 * Показывает информацию сотрудника в режиме только просмотра
 */
const EmployeeViewDrawer = ({ visible, employee, onClose, onEdit }) => {
  const [form] = Form.useForm();
  const [activeKeys, setActiveKeys] = useState(["personal", "documents"]);

  const { citizenships, user, getFieldProps } = useEmployeeForm(employee, false);

  // Считаем по самому сотруднику: внутренняя форма useEmployeeForm не связана
  // с формой дровера, поэтому её requiresPatent здесь всегда был бы true.
  const requiresPatent = doesEmployeeRequirePatent(employee);

  useEffect(() => {
    const formData = buildEmployeeViewDrawerFormData(employee);
    if (formData) {
      form.setFieldsValue(formData);
    }
  }, [employee, form]);

  const canViewStatuses = canManageEmployeeStatuses(user?.role);

  const collapseItems = useMemo(
    () => {
      const items = buildEmployeeViewDrawerItems({
        employee,
        citizenships,
        requiresPatent,
        canViewStatuses,
        getFieldProps,
      });

      if (employee?.id && canViewStatuses) {
        items.push({
          key: "history",
          label: "🕒 История изменений",
          children: <EmployeeChangeHistoryTab employeeId={employee.id} />,
        });
      }

      return items;
    },
    [
      employee,
      citizenships,
      requiresPatent,
      canViewStatuses,
      getFieldProps,
    ],
  );

  return (
    <Drawer
      title={`${employee?.lastName} ${employee?.firstName} ${employee?.middleName || ""}`}
      placement="right"
      onClose={onClose}
      open={visible}
      closeIcon={<CloseOutlined />}
      width={320}
      styles={{
        body: { padding: "16px", overflow: "auto" },
      }}
      footer={
        <Space style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onClose}>Закрыть</Button>
          <Button type="primary" icon={<EditOutlined />} onClick={onEdit}>
            Редактировать
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Collapse activeKey={activeKeys} onChange={setActiveKeys} ghost items={collapseItems} />
      </Form>
    </Drawer>
  );
};

export default EmployeeViewDrawer;
