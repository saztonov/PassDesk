import { useCallback, useEffect, useRef } from "react";

export const useEmployeeFormSaveHandlers = ({
  form,
  employee,
  onSuccess,
  onCancel,
  message,
  linkingMode,
  setLinkingMode,
  setLoading,
  setActiveTab,
  setTabsValidation,
  setSelectedCitizenship,
  setPassportType,
  applyLinkingModePayload,
  shouldStayOpenAfterSave,
  formatEmployeeFormPayload,
}) => {
  const isFormResetRef = useRef(false);
  const autoSaveTimeoutRef = useRef(null);
  const autoSavingRef = useRef(false);
  const lastAutoSavedHashRef = useRef(null);

  const resetFormStateAfterSave = useCallback(
    ({ resetLinkingMode = false } = {}) => {
      isFormResetRef.current = true;
      form.resetFields();
      setActiveTab("1");
      setTabsValidation({ 1: false, 2: false, 3: false });
      setSelectedCitizenship(null);
      setPassportType(null);
      if (resetLinkingMode) {
        setLinkingMode(false);
      }
    },
    [
      form,
      setActiveTab,
      setLinkingMode,
      setPassportType,
      setSelectedCitizenship,
      setTabsValidation,
    ],
  );

  const saveDraft = useCallback(
    async ({ silent = false, preserveForm = false } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
        }

        const values = form.getFieldsValue(true);
        const formattedValues = formatEmployeeFormPayload(values, {
          isDraft: true,
        });
        const savedEmployee = await onSuccess(formattedValues);

        if (!employee && !preserveForm) {
          resetFormStateAfterSave();
        }
        return savedEmployee || null;
      } catch (error) {
        console.error("Save draft error:", error);
        return null;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [
      employee,
      form,
      formatEmployeeFormPayload,
      onSuccess,
      resetFormStateAfterSave,
      setLoading,
    ],
  );

  const handleSaveDraft = useCallback(async () => {
    return saveDraft({ silent: false, preserveForm: false });
  }, [saveDraft]);

  const ensureEmployeeId = useCallback(async () => {
    if (employee?.id) {
      return employee.id;
    }
    const savedEmployee = await saveDraft({ silent: true, preserveForm: true });
    return savedEmployee?.id || null;
  }, [employee?.id, saveDraft]);

  const scheduleAutoSaveDraft = useCallback(() => {
    if (employee?.id || isFormResetRef.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (autoSavingRef.current || employee?.id) {
        return;
      }

      const values = form.getFieldsValue(["inn", "lastName"]);
      const rawInn = values?.inn ? values.inn.replace(/[^\d]/g, "") : "";
      const hasValidInn = rawInn.length === 10 || rawInn.length === 12;
      const normalizedLastName = values?.lastName?.trim() || "";
      const hasMinFields = hasValidInn || normalizedLastName.length > 0;

      if (!hasMinFields) {
        return;
      }

      const hash = `${rawInn}|${normalizedLastName}`;
      if (lastAutoSavedHashRef.current === hash) {
        return;
      }

      autoSavingRef.current = true;
      try {
        const savedEmployee = await saveDraft({ silent: true, preserveForm: true });
        if (savedEmployee?.id || employee?.id) {
          lastAutoSavedHashRef.current = hash;
        }
      } finally {
        autoSavingRef.current = false;
      }
    }, 600);
  }, [employee?.id, form, saveDraft]);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setLoading(true);
      await form.validateFields();

      const values = form.getFieldsValue(true);
      const formattedValues = formatEmployeeFormPayload(values, {
        isDraft: false,
      });

      const payload = applyLinkingModePayload(
        formattedValues,
        employee,
        linkingMode,
      );

      await onSuccess(payload);

      if (shouldStayOpenAfterSave(linkingMode)) {
        message.success("Сотрудник успешно привязан к вашему профилю");
        resetFormStateAfterSave({ resetLinkingMode: true });
      } else if (!employee) {
        resetFormStateAfterSave();
      } else {
        onCancel();
      }
    } catch (error) {
      console.error("Validation or save error:", error);
      if (error.errorFields) {
        message.error("Пожалуйста, заполните все обязательные поля");
      }
    } finally {
      setLoading(false);
    }
  }, [
    applyLinkingModePayload,
    employee,
    form,
    formatEmployeeFormPayload,
    linkingMode,
    message,
    onCancel,
    onSuccess,
    resetFormStateAfterSave,
    setLoading,
    shouldStayOpenAfterSave,
  ]);

  return {
    isFormResetRef,
    handleSave,
    handleSaveDraft,
    ensureEmployeeId,
    scheduleAutoSaveDraft,
  };
};
