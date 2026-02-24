import { useCallback } from "react";
import { useEmployeeActions, useCheckInn } from "@/entities/employee";
import { employeeApi } from "@/entities/employee";
import { employeeService } from "@/services/employeeService";

export const useEmployeesCrudActions = ({
  modal,
  navigate,
  closeEditModal,
  refetchEmployees,
  editingEmployee,
  setEditingEmployee,
}) => {
  const { createEmployee, updateEmployee, deleteEmployee, updateDepartment } =
    useEmployeeActions(refetchEmployees);
  const { checkInn } = useCheckInn();

  const handleCheckInn = useCallback(
    async (innValue) => {
      try {
        const foundEmployee = await checkInn(innValue);
        if (!foundEmployee) return;

        const fullName = [
          foundEmployee.lastName,
          foundEmployee.firstName,
          foundEmployee.middleName,
        ]
          .filter(Boolean)
          .join(" ");

        modal.confirm({
          title: "Сотрудник с таким ИНН уже существует",
          content: `Перейти к редактированию?\n\n${fullName}`,
          okText: "ОК",
          cancelText: "Отмена",
          onOk: () => {
            closeEditModal();
            navigate(`/employees/edit/${foundEmployee.id}`);
          },
        });
      } catch (error) {
        if (error.response?.status === 409) {
          modal.error({
            title: "Ошибка",
            content:
              error.response?.data?.message ||
              "Сотрудник с таким ИНН уже существует. Обратитесь к администратору.",
            okText: "ОК",
          });
        } else {
          console.error("Ошибка при проверке ИНН:", error);
        }
      }
    },
    [checkInn, modal, closeEditModal, navigate],
  );

  const handleFilesUpdated = useCallback(() => {
    refetchEmployees();
  }, [refetchEmployees]);

  const handleSitesUpdated = useCallback(() => {
    refetchEmployees();
  }, [refetchEmployees]);

  const handleDelete = useCallback(
    async (id) => {
      await deleteEmployee(id);
      refetchEmployees();
    },
    [deleteEmployee, refetchEmployees],
  );

  const handleMarkForDeletion = useCallback(
    async (employee) => {
      modal.confirm({
        title: "Пометить сотрудника на удаление?",
        content: `${employee.lastName} ${employee.firstName} будет помечен на удаление.`,
        okText: "Пометить",
        okType: "danger",
        cancelText: "Отмена",
        onOk: async () => {
          await employeeService.markForDeletion(employee.id);
          refetchEmployees();
        },
      });
    },
    [modal, refetchEmployees],
  );

  const handleDepartmentChange = useCallback(
    async (employeeId, departmentId) => {
      await updateDepartment(employeeId, departmentId);
      refetchEmployees();
    },
    [updateDepartment, refetchEmployees],
  );

  const handleFormSuccess = useCallback(
    async (values) => {
      if (editingEmployee) {
        const updated = await updateEmployee(editingEmployee.id, values);
        setEditingEmployee(updated);

        if (
          editingEmployee.statusMappings &&
          editingEmployee.statusMappings.length > 0
        ) {
          const hasUploadedStatus = editingEmployee.statusMappings.some(
            (mapping) => mapping.isUpload,
          );

          if (hasUploadedStatus) {
            try {
              await employeeApi.setEditedStatus(editingEmployee.id, true);
            } catch (error) {
              console.warn("Error setting edited status:", error);
            }
          }
        }
        refetchEmployees();
        return updated;
      } else {
        const newEmployee = await createEmployee(values);
        setEditingEmployee(newEmployee);
        refetchEmployees();
        return newEmployee;
      }
    },
    [
      editingEmployee,
      updateEmployee,
      setEditingEmployee,
      createEmployee,
      refetchEmployees,
    ],
  );

  return {
    handleCheckInn,
    handleFilesUpdated,
    handleSitesUpdated,
    handleDelete,
    handleMarkForDeletion,
    handleDepartmentChange,
    handleFormSuccess,
  };
};
