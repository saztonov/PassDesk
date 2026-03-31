import { useEffect, useRef, useState } from "react";
import {
  useEmployeeActions,
  useCheckInn,
  employeeApi,
} from "@/entities/employee";

export const useAddEmployeePage = ({ id, navigate, message, modal }) => {
  const [editingEmployee, setEditingEmployee] = useState(null);
  const employeeLoadedRef = useRef(false);
  const savedEmployeeIdRef = useRef(null);
  const initialEmployeeIdRef = useRef(id || null);

  const { createEmployee, updateEmployee } = useEmployeeActions(() => {
    // Не нужно refetch, так как после сохранения выполняется переход
  });

  const { checkInn } = useCheckInn();

  const handleCheckInn = async (innValue) => {
    try {
      const foundEmployee = await checkInn(innValue);
      if (foundEmployee) {
        const currentEmployeeId =
          editingEmployee?.id || savedEmployeeIdRef.current;
        if (currentEmployeeId && foundEmployee.id === currentEmployeeId) {
          return;
        }

        const fullName = [
          foundEmployee.lastName,
          foundEmployee.firstName,
          foundEmployee.middleName,
        ]
          .filter(Boolean)
          .join(" ");

        const isOwner = foundEmployee.isOwner !== false;
        const canLink = foundEmployee.canLink === true;

        if (canLink && !isOwner) {
          modal.confirm({
            title: "Привязать существующего сотрудника?",
            content: `${fullName}\n\nПривязать этого сотрудника к своему профилю?`,
            okText: "Привязать",
            cancelText: "Отмена",
            onOk: () => {
              employeeLoadedRef.current = true;
              setEditingEmployee({ ...foundEmployee, linkingMode: true });
            },
          });
        } else {
          modal.confirm({
            title: "Сотрудник с таким ИНН уже существует",
            content: `Перейти к редактированию?\n\n${fullName}`,
            okText: "ОК",
            cancelText: "Отмена",
            onOk: () => {
              navigate(`/employees/edit/${foundEmployee.id}`);
            },
          });
        }
      }
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
  };

  useEffect(() => {
    if (employeeLoadedRef.current) {
      return;
    }

    if (id) {
      savedEmployeeIdRef.current = id;
      employeeApi
        .getById(id)
        .then((response) => {
          setEditingEmployee(response.data);
          employeeLoadedRef.current = true;
          savedEmployeeIdRef.current = response.data?.id || id;
        })
        .catch((error) => {
          message.error("Ошибка загрузки данных сотрудника");
          console.error("Error loading employee:", error);
          navigate("/employees");
        });
    }

    return () => {
      employeeLoadedRef.current = false;
    };
  }, [id, navigate, message]);

  const handleFormSuccess = async (values) => {
    const valuesToSave = { ...values };
    const draftEmployeeId = valuesToSave.__draftEmployeeId || null;
    delete valuesToSave.__draftEmployeeId;

    if (values.employeeId) {
      const linkedEmployee = await createEmployee(valuesToSave);

      message.success("Сотрудник успешно привязан!");

      setTimeout(() => {
        navigate("/employees");
      }, 1000);

      return linkedEmployee;
    }

    if (editingEmployee) {
      const updated = await updateEmployee(editingEmployee.id, valuesToSave);
      setEditingEmployee(updated);
      savedEmployeeIdRef.current = updated?.id || editingEmployee.id;

      if (!valuesToSave.isDraft) {
        setTimeout(() => {
          navigate("/employees");
        }, 1000);
      }
      return updated;
    } else if (draftEmployeeId) {
      const updated = await updateEmployee(draftEmployeeId, valuesToSave);
      setEditingEmployee(updated);
      savedEmployeeIdRef.current = updated?.id || draftEmployeeId;

      // После первого сохранения черновика фиксируемся на route с id,
      // чтобы последующее редактирование/файлы всегда были в одной карточке.
      if (!id && valuesToSave.isDraft && (updated?.id || draftEmployeeId)) {
        navigate(`/employees/edit/${updated?.id || draftEmployeeId}`, {
          replace: true,
        });
      }

      if (!valuesToSave.isDraft) {
        setTimeout(() => {
          navigate("/employees");
        }, 1000);
      }
      return updated;
    } else {
      const newEmployee = await createEmployee(valuesToSave);
      setEditingEmployee(newEmployee);
      savedEmployeeIdRef.current = newEmployee?.id;

      if (!id && valuesToSave.isDraft && newEmployee?.id) {
        navigate(`/employees/edit/${newEmployee.id}`, { replace: true });
      }

      if (!valuesToSave.isDraft) {
        setTimeout(() => {
          navigate("/employees");
        }, 1000);
      }
      return newEmployee;
    }
  };

  const handleCancel = async (options = {}) => {
    const { skipDraftCleanup = false } = options;
    const currentEmployeeId = savedEmployeeIdRef.current || editingEmployee?.id || null;
    const shouldDiscardDraft =
      !skipDraftCleanup && !initialEmployeeIdRef.current && currentEmployeeId;

    if (shouldDiscardDraft) {
      try {
        await employeeApi.discardDraft(currentEmployeeId);
      } catch (error) {
        console.error("Ошибка при отмене черновика сотрудника:", error);
        message.error(
          error.response?.data?.message ||
            "Не удалось удалить временный черновик сотрудника",
        );
        return;
      }
    }

    navigate("/employees");
  };

  return {
    editingEmployee,
    handleCheckInn,
    handleFormSuccess,
    handleCancel,
  };
};
