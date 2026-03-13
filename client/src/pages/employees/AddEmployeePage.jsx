import { useNavigate, useParams } from "react-router-dom";
import { Button, Typography, Grid, App } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAddEmployeePage } from "@/modules/employees/model/useAddEmployeePage";
import MobileEmployeeForm from "@/modules/employees/ui/MobileEmployeeForm";
import EmployeeFormModal from "@/modules/employees/ui/EmployeeFormModal";

const { Title } = Typography;
const { useBreakpoint } = Grid;

/**
 * Страница добавления/редактирования сотрудника
 * Используется на мобильных устройствах как отдельная страница
 * На десктопе остается модальное окно
 */
const AddEmployeePage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message, modal } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const { editingEmployee, handleCheckInn, handleFormSuccess, handleCancel } =
    useAddEmployeePage({
      id,
      navigate,
      message,
      modal,
    });

  const handleClose = () => {
    void handleCancel();
  };

  usePageTitle(id ? "Редактирование" : "Добавление", isMobile);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {!isMobile ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 24,
            gap: 16,
            padding: "16px 24",
            flexShrink: 0,
          }}
        >
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/employees")}
            size="large"
          >
            Назад
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {id ? "Редактирование сотрудника" : "Добавление сотрудника"}
          </Title>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {isMobile ? (
          <MobileEmployeeForm
            employee={editingEmployee}
            onSuccess={handleFormSuccess}
            onCancel={handleCancel}
            onCheckInn={handleCheckInn}
          />
        ) : (
          <EmployeeFormModal
            visible={true}
            employee={editingEmployee}
            onCancel={handleClose}
            onSuccess={handleFormSuccess}
            onCheckInn={handleCheckInn}
          />
        )}
      </div>
    </div>
  );
};

export default AddEmployeePage;
