import { useCallback, useEffect, useRef } from "react";
import { employeeApi } from "@/entities/employee/api/employeeApi";

export const useEmployeeFormSaveHandlers = ({
  form,
  visible,
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
  const draftEmployeeIdRef = useRef(employee?.id || null);
  const isAutoCreatedRef = useRef(false);
  const isExplicitlySavedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      draftEmployeeIdRef.current = null;
      lastAutoSavedHashRef.current = null;
      autoSavingRef.current = false;
      isAutoCreatedRef.current = false;
      isExplicitlySavedRef.current = false;
      return;
    }
    draftEmployeeIdRef.current = employee?.id || null;
  }, [employee?.id, visible]);

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
        const draftEmployeeId = employee?.id || draftEmployeeIdRef.current;
        if (draftEmployeeId) {
          formattedValues.__draftEmployeeId = draftEmployeeId;
        }
        const savedEmployee = await onSuccess(formattedValues);
        if (savedEmployee?.id) {
          const isNewEmployee = !employee?.id && !draftEmployeeIdRef.current;
          draftEmployeeIdRef.current = savedEmployee.id;
          if (silent && isNewEmployee) {
            isAutoCreatedRef.current = true;
          }
        }

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
    isExplicitlySavedRef.current = true;
    return saveDraft({ silent: false, preserveForm: false });
  }, [saveDraft]);

  const ensureEmployeeId = useCallback(async () => {
    const effectiveEmployeeId = employee?.id || draftEmployeeIdRef.current;
    if (effectiveEmployeeId) {
      return effectiveEmployeeId;
    }
    const savedEmployee = await saveDraft({ silent: true, preserveForm: true });
    const savedEmployeeId = savedEmployee?.id || null;
    if (savedEmployeeId) {
      draftEmployeeIdRef.current = savedEmployeeId;
    }
    return savedEmployeeId;
  }, [employee?.id, saveDraft]);

  const scheduleAutoSaveDraft = useCallback(() => {
    if (employee?.id || draftEmployeeIdRef.current || isFormResetRef.current) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (
        autoSavingRef.current ||
        employee?.id ||
        draftEmployeeIdRef.current
      ) {
        return;
      }

      const values = form.getFieldsValue(["inn", "lastName", "firstName"]);
      const rawInn = values?.inn ? values.inn.replace(/[^\d]/g, "") : "";
      const hasValidInn = rawInn.length === 10 || rawInn.length === 12;
      const normalizedLastName = values?.lastName?.trim() || "";
      const normalizedFirstName = values?.firstName?.trim() || "";
      const hasMinFields = normalizedLastName.length >= 2 && normalizedFirstName.length >= 2;

      if (!hasMinFields) {
        return;
      }

      const hash = `${rawInn}|${normalizedLastName}|${normalizedFirstName}`;
      if (lastAutoSavedHashRef.current === hash) {
        return;
      }

      autoSavingRef.current = true;
      try {
        const savedEmployee = await saveDraft({
          silent: true,
          preserveForm: true,
        });
        if (savedEmployee?.id || employee?.id || draftEmployeeIdRef.current) {
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
    isExplicitlySavedRef.current = true;
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
      const draftEmployeeId = employee?.id || draftEmployeeIdRef.current;
      if (draftEmployeeId && !payload.employeeId) {
        payload.__draftEmployeeId = draftEmployeeId;
      }

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

  const discardIfAutoCreated = useCallback(async () => {
    if (!isAutoCreatedRef.current || isExplicitlySavedRef.current) {
      return;
    }
    const idToDiscard = draftEmployeeIdRef.current;
    if (!idToDiscard) {
      return;
    }
    try {
      await employeeApi.discardDraft(idToDiscard);
    } catch (error) {
      console.error("Failed to discard auto-created draft employee:", error);
    }
  }, []);

  return {
    isFormResetRef,
    handleSave,
    handleSaveDraft,
    ensureEmployeeId,
    scheduleAutoSaveDraft,
    discardIfAutoCreated,
  };
};
