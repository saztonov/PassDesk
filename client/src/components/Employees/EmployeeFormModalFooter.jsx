import { Button, Space } from "antd";

const EmployeeFormModalFooter = ({
  employee,
  loading,
  allTabsValid,
  onCancel,
  onSaveDraft,
  onSave,
  onNext,
  allowTabNavigation = true,
}) => {
  const canSaveDirectly = allTabsValid() || !allowTabNavigation;

  return (
    <Space wrap>
      <Button onClick={onCancel}>{employee ? "Закрыть" : "Отмена"}</Button>
      <Button onClick={onSaveDraft} loading={loading}>
        Сохранить черновик
      </Button>
      {canSaveDirectly ? (
        <Button
          type="primary"
          onClick={onSave}
          loading={loading}
          style={
            allTabsValid()
              ? { backgroundColor: "#52c41a", borderColor: "#52c41a" }
              : undefined
          }
        >
          Сохранить
        </Button>
      ) : (
        <Button type="primary" onClick={onNext}>
          Следующая
        </Button>
      )}
    </Space>
  );
};

export default EmployeeFormModalFooter;
