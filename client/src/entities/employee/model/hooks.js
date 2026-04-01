import { useState, useEffect, useCallback } from "react";
import { App } from "antd";
import React from "react";
import { employeeApi } from "../api/employeeApi";
import { useEmployeesStore } from "@/store/employeesStore";

/**
 * Хук для работы с сотрудниками
 * Загружает только текущую страницу данных с сервера
 * @param {boolean} activeOnly - показывать только активных сотрудников
 * @param {object} queryParams - параметры фильтрации и пагинации
 * @param {boolean} enabled - флаг включения загрузки (по умолчанию true)
 */
export const useEmployees = (
  activeOnly = false,
  queryParams = {},
  enabled = true,
) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  /**
   * Загрузка текущей страницы сотрудников
   */
  const fetchEmployees = useCallback(
    async (force = false) => {
      const hasVisibleEmployees = employees.length > 0;

      // Проверяем кэш (если не force)
      if (!force) {
        const cached = useEmployeesStore
          .getState()
          .getEmployees({ activeOnly, ...queryParams });
        if (cached) {
          setEmployees(cached.employees);
          setTotalCount(cached.totalCount);
          setLoading(false);
          setBackgroundLoading(false);
          return cached.employees;
        }
      }

      setLoading(!hasVisibleEmployees);
      setBackgroundLoading(hasVisibleEmployees);
      setError(null);

      try {
        const response = await employeeApi.getAll({
          activeOnly,
          ...queryParams,
        });

        const employeesPage = response?.data?.employees || [];
        const pagination = response?.data?.pagination || {};
        const total = pagination.total || employeesPage.length;

        setTotalCount(total);
        setEmployees(employeesPage);
        setLoading(false);
        setBackgroundLoading(false);
        useEmployeesStore
          .getState()
          .setEmployees(employeesPage, total, {
            activeOnly,
            ...queryParams,
          });

        return employeesPage;
      } catch (err) {
        console.error("Error fetching employees:", err);
        setError(err);
        setEmployees([]);
        setLoading(false);
        setBackgroundLoading(false);
        return [];
      }
    },
    [activeOnly, employees.length, queryParams],
  );

  useEffect(() => {
    if (enabled) {
      fetchEmployees();
    }

    return undefined;
  }, [fetchEmployees, enabled]);

  return {
    employees,
    loading,
    backgroundLoading, // Индикатор фоновой загрузки
    totalCount, // Общее количество сотрудников
    error,
    refetch: () => fetchEmployees(true), // force reload
    invalidateCache: () => useEmployeesStore.getState().invalidate(),
  };
};

/**
 * Хук для операций с сотрудником (CRUD)
 */
export const useEmployeeActions = (onSuccess) => {
  const { message, notification } = App.useApp();
  const [loading, setLoading] = useState(false);

  const createEmployee = async (values) => {
    setLoading(true);
    try {
      // Удаляем флаг isDraft перед отправкой на сервер
      const isDraft = values.isDraft;
      const valuesToSend = { ...values };
      delete valuesToSend.__draftEmployeeId;
      // Для первичного сохранения черновика передаем isDraft=true на бэкенд,
      // чтобы статус сотрудника не пересчитывался в completed.
      if (!isDraft) {
        delete valuesToSend.isDraft;
      }

      console.log("📤 Creating employee with values:", valuesToSend);

      const response = await employeeApi.create(valuesToSend);

      // Показываем сообщение в зависимости от того, черновик это или полная карточка
      if (isDraft) {
        message.success("Черновик сохранен");
      } else {
        message.success("Сотрудник создан");
      }

      // Сбрасываем кэш сотрудников при создании
      useEmployeesStore.getState().invalidate();

      // employeeApi.create уже возвращает response.data, которая имеет структуру:
      // {success: true, message: "...", data: {id, firstName, ...}}
      // Поэтому нужно взять response.data (это данные сотрудника)
      const createdEmployee = response.data;
      onSuccess?.(createdEmployee);
      return createdEmployee;
    } catch (error) {
      console.error("Error creating employee:", error);

      // Формируем понятное сообщение об ошибке
      let errorMessage = "Ошибка при сохранении";

      if (
        error.response?.data?.message === "Validation failed" &&
        error.response?.data?.errors
      ) {
        // Собираем список полей с ошибками
        const fields = error.response.data.errors
          .map((e) => {
            const fieldNames = {
              firstName: "Имя",
              lastName: "Фамилия",
              positionId: "Должность",
              citizenshipId: "Гражданство",
              birthDate: "Дата рождения",
              phone: "Телефон",
              inn: "ИНН",
              snils: "СНИЛС",
              passportNumber: "Паспорт",
              passportDate: "Дата выдачи паспорта",
              passportIssuer: "Орган выдачи паспорта",
              passportDepartmentCode: "Код подразделения",
              registrationAddress: "Адрес регистрации",
            };
            return fieldNames[e.field] || e.field;
          })
          .join(", ");
        errorMessage = values.isDraft
          ? `Для черновика требуется: ${fields}`
          : `Заполните обязательные поля: ${fields}`;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
        const conflicting = error.response.data?.conflictingEmployee;
        if (conflicting) {
          const fullName = [conflicting.lastName, conflicting.firstName, conflicting.middleName]
            .filter(Boolean)
            .join(" ");
          notification.error({
            message: "Конфликт данных",
            description: React.createElement("span", null,
              errorMessage + ". Сотрудник: ",
              React.createElement("a", { href: `/employees/edit/${conflicting.id}`, target: "_blank", rel: "noopener noreferrer" }, fullName),
              ` (ID: ${conflicting.id})`
            ),
            duration: 8,
          });
          throw error;
        }
      }

      message.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateEmployee = async (id, values) => {
    setLoading(true);
    try {
      // Удаляем флаг isDraft перед отправкой на сервер
      const isDraft = values.isDraft;
      const valuesToSend = { ...values };
      delete valuesToSend.isDraft;
      delete valuesToSend.__draftEmployeeId;

      // Используем разные методы API для черновиков и полного сохранения
      const response = isDraft
        ? await employeeApi.updateDraft(id, valuesToSend)
        : await employeeApi.update(id, valuesToSend);

      // Показываем сообщение в зависимости от того, черновик это или полная карточка
      if (isDraft) {
        message.success("Черновик обновлен");
      } else {
        message.success("Сотрудник обновлен");
      }

      // Сбрасываем кэш сотрудников при обновлении
      useEmployeesStore.getState().invalidate();

      // employeeApi.update возвращает response.data (тело ответа):
      // {success: true, message: "...", data: {id, firstName, ...}}
      // Сам сотрудник лежит в .data
      const updatedEmployee = response.data || response;
      onSuccess?.(updatedEmployee);
      return updatedEmployee;
    } catch (error) {
      console.error("Error updating employee:", error);

      // Формируем понятное сообщение об ошибке
      let errorMessage = "Ошибка при обновлении";

      if (
        error.response?.data?.message === "Validation failed" &&
        error.response?.data?.errors
      ) {
        // Собираем список полей с ошибками
        const fields = error.response.data.errors
          .map((e) => {
            const fieldNames = {
              firstName: "Имя",
              lastName: "Фамилия",
              positionId: "Должность",
              citizenshipId: "Гражданство",
              birthDate: "Дата рождения",
              phone: "Телефон",
              inn: "ИНН",
              snils: "СНИЛС",
              passportNumber: "Паспорт",
              passportDate: "Дата выдачи паспорта",
              passportIssuer: "Орган выдачи паспорта",
              passportDepartmentCode: "Код подразделения",
              registrationAddress: "Адрес регистрации",
            };
            return fieldNames[e.field] || e.field;
          })
          .join(", ");
        errorMessage = values.isDraft
          ? `Для черновика требуется: ${fields}`
          : `Заполните обязательные поля: ${fields}`;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
        const conflicting = error.response.data?.conflictingEmployee;
        if (conflicting) {
          const fullName = [conflicting.lastName, conflicting.firstName, conflicting.middleName]
            .filter(Boolean)
            .join(" ");
          notification.error({
            message: "Конфликт данных",
            description: React.createElement("span", null,
              errorMessage + ". Сотрудник: ",
              React.createElement("a", { href: `/employees/edit/${conflicting.id}`, target: "_blank", rel: "noopener noreferrer" }, fullName),
              ` (ID: ${conflicting.id})`
            ),
            duration: 8,
          });
          throw error;
        }
      }

      message.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deleteEmployee = async (id) => {
    try {
      await employeeApi.delete(id);
      message.success("Сотрудник удален");

      // Сбрасываем кэш сотрудников при удалении
      useEmployeesStore.getState().invalidate();

      onSuccess?.();
    } catch (error) {
      // Проверяем наличие сообщения об ошибке от сервера
      const errorMessage =
        error.response?.data?.message || "Ошибка при удалении сотрудника";
      message.error(errorMessage);
      throw error;
    }
  };

  const updateDepartment = async (employeeId, departmentId) => {
    try {
      await employeeApi.updateDepartment(employeeId, departmentId);
      message.success("Подразделение обновлено");

      // Сбрасываем кэш сотрудников при обновлении подразделения
      useEmployeesStore.getState().invalidate();

      onSuccess?.();
    } catch (error) {
      message.error("Ошибка при обновлении подразделения");
      console.error("Error updating department:", error);
      throw error;
    }
  };

  return {
    loading,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    updateDepartment,
  };
};
