import { useNavigate, useParams } from "react-router-dom";
import { Button, Typography, Grid, App } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useAddEmployeePage } from "@/modules/employees/model/useAddEmployeePage";
import MobileEmployeeForm from "@/modules/employees/ui/MobileEmployeeForm";
import EmployeeFormModal from "@/modules/employees/ui/EmployeeFormModal";

const { Title } = Typography;
const { useBreakpoint } = Grid;

/**
 * Страница добавления/редактирования сотрудника
 * Используется как отдельная страница
 * На мобильных устройствах рендерится специальная mobile-форма
 */
const AddEmployeePage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { message, modal } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [closeRequestToken, setCloseRequestToken] = useState(0);

  const { editingEmployee, handleCheckInn, handleFormSuccess, handleCancel } =
    useAddEmployeePage({
      id,
      navigate,
      message,
      modal,
    });

  const handleClose = (options = {}) => {
    void handleCancel(options);
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
            justifyContent: "space-between",
            marginBottom: 24,
            gap: 16,
            padding: "16px 24",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setCloseRequestToken((value) => value + 1)}
            >
              Назад
            </Button>
            <Title level={3} style={{ margin: 0 }}>
              {id ? "Редактирование сотрудника" : "Добавление сотрудника"}
            </Title>
          </div>
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {isMobile ? (
          <MobileEmployeeForm
            employee={editingEmployee}
            onSuccess={handleFormSuccess}
            onCancel={handleCancel}
            onCheckInn={handleCheckInn}
            isExistingSession={Boolean(id)}
          />
        ) : (
          <EmployeeFormModal
            visible={true}
            employee={editingEmployee}
            onCancel={handleClose}
            onSuccess={handleFormSuccess}
            onCheckInn={handleCheckInn}
            externalCloseRequestToken={closeRequestToken}
            isExistingSession={Boolean(id)}
            mode="page"
          />
        )}
      </div>
    </div>
  );
};

export default AddEmployeePage;
