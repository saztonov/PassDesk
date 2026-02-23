import { useCallback, useEffect, useRef, useState } from "react";

export const useEmployeeFormInputHandlers = ({
  form,
  employee,
  onCheckInn,
  message,
  dataLoaded,
  passportType,
  setPassportType,
  scheduleValidation,
  scheduleAutoSaveDraft,
  isFormResetRef,
  filterCyrillicOnly,
  capitalizeFirstLetter,
}) => {
  const [latinInputError, setLatinInputError] = useState(null);
  const latinErrorTimeoutRef = useRef(null);
  const validationTimeoutRef = useRef(null);

  const handleFieldsChange = useCallback(
    (changedFields) => {
      if (!dataLoaded) {
        return;
      }

      const currentPassportType = form.getFieldValue("passportType");
      if (currentPassportType !== passportType) {
        setPassportType(currentPassportType);
      }

      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }

      validationTimeoutRef.current = setTimeout(() => {
        scheduleValidation();
      }, 100);

      scheduleAutoSaveDraft();
      isFormResetRef.current = false;
    },
    [
      dataLoaded,
      form,
      isFormResetRef,
      passportType,
      scheduleAutoSaveDraft,
      scheduleValidation,
      setPassportType,
    ],
  );

  const handleInnBlur = useCallback(async () => {
    if (employee || !onCheckInn || isFormResetRef.current) {
      return;
    }

    const innValue = form.getFieldValue("inn");
    const normalized = innValue ? innValue.replace(/[^\d]/g, "") : "";

    if ((normalized.length === 10 || normalized.length === 12) && innValue) {
      scheduleAutoSaveDraft();
      try {
        await onCheckInn(innValue);
      } catch (error) {
        if (error.response?.status === 409) {
          message.error(
            error.response?.data?.message ||
              "Сотрудник с таким ИНН уже существует. Обратитесь к администратору.",
          );
        } else if (error.response?.status !== 404) {
          console.error("Ошибка при проверке ИНН:", error);
        }
      }
    }
  }, [
    employee,
    form,
    isFormResetRef,
    message,
    onCheckInn,
    scheduleAutoSaveDraft,
  ]);

  const handleFullNameChange = useCallback(
    (fieldName, value) => {
      const hasLatin = /[a-zA-Z]/.test(value);

      if (hasLatin) {
        setLatinInputError(fieldName);

        if (latinErrorTimeoutRef.current) {
          clearTimeout(latinErrorTimeoutRef.current);
        }

        latinErrorTimeoutRef.current = setTimeout(() => {
          setLatinInputError(null);
        }, 3000);
      }

      const filtered = filterCyrillicOnly(value);
      const capitalizedValue = capitalizeFirstLetter(filtered);
      form.setFieldValue(fieldName, capitalizedValue);
    },
    [capitalizeFirstLetter, filterCyrillicOnly, form],
  );

  useEffect(() => {
    return () => {
      if (latinErrorTimeoutRef.current) {
        clearTimeout(latinErrorTimeoutRef.current);
      }
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  return {
    latinInputError,
    handleFieldsChange,
    handleInnBlur,
    handleFullNameChange,
  };
};
