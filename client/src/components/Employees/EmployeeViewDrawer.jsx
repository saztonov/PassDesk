import { Drawer, Form, Collapse, Button, Space } from "antd";
import { CloseOutlined, EditOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useEmployeeForm } from "./useEmployeeForm";
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

  const {
    citizenships,
    requiresPatent,
    user,
    getFieldProps,
  } = useEmployeeForm(employee, false);

  useEffect(() => {
    const formData = buildEmployeeViewDrawerFormData(employee);
    if (formData) {
      form.setFieldsValue(formData);
    }
  }, [employee, form]);

  const canViewStatuses = user?.role === "admin";

  const collapseItems = useMemo(
    () =>
      buildEmployeeViewDrawerItems({
        employee,
        citizenships,
        requiresPatent,
        canViewStatuses,
        getFieldProps,
      }),
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
