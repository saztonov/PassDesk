import { useCallback, useEffect, useRef, useState } from "react";
import { employeeApi } from "@/entities/employee/api/employeeApi";

export const useMobileEmployeeFormInteractions = ({
  form,
  employee,
  isExistingSession,
  onCheckInn,
  messageApi,
  handleSave,
  handleSaveDraft,
  filterCyrillicOnly,
  capitalizeFirstLetter,
  lastSavedSnapshotRef,
}) => {
  const innCheckTimeoutRef = useRef(null);
  const isFormResetRef = useRef(false);
  const autoSaveTimeoutRef = useRef(null);
  const autoSavingRef = useRef(false);
  const lastAutoSavedHashRef = useRef(null);
  const draftEmployeeIdRef = useRef(employee?.id || null);
  const startedWithExistingEmployeeRef = useRef(Boolean(isExistingSession));
  const isExplicitlySavedRef = useRef(false);
  const canSaveTimeoutRef = useRef(null);
  const latinErrorTimeoutRef = useRef(null);
  const [canSave, setCanSave] = useState(false);
  const [latinInputError, setLatinInputError] = useState(null);

  useEffect(() => {
    draftEmployeeIdRef.current = employee?.id || null;
    if (!employee?.id) {
      lastAutoSavedHashRef.current = null;
    }
  }, [employee?.id]);

  useEffect(() => {
    if (isExistingSession) {
      startedWithExistingEmployeeRef.current = true;
    }
  }, [isExistingSession]);

  const handleSaveWithReset = useCallback(async () => {
    if (innCheckTimeoutRef.current) {
      clearTimeout(innCheckTimeoutRef.current);
    }
    isFormResetRef.current = true;
    isExplicitlySavedRef.current = true;
    await handleSave({ draftEmployeeId: draftEmployeeIdRef.current });
    // Save completed explicitly: disable any pending draft cleanup paths.
    draftEmployeeIdRef.current = null;
    lastAutoSavedHashRef.current = null;
    lastSavedSnapshotRef.current = JSON.stringify(form.getFieldsValue(true));
  }, [form, handleSave, lastSavedSnapshotRef]);

  const handleSaveDraftWithReset = useCallback(async () => {
    if (innCheckTimeoutRef.current) {
      clearTimeout(innCheckTimeoutRef.current);
    }
    isFormResetRef.current = true;
    isExplicitlySavedRef.current = true;
    const saved = await handleSaveDraft({
      draftEmployeeId: draftEmployeeIdRef.current,
    });
    if (saved?.id) {
      draftEmployeeIdRef.current = saved.id;
    }
    lastSavedSnapshotRef.current = JSON.stringify(form.getFieldsValue(true));
    return saved;
  }, [form, handleSaveDraft, lastSavedSnapshotRef]);

  const ensureEmployeeId = useCallback(async () => {
    const effectiveEmployeeId = employee?.id || draftEmployeeIdRef.current;
    if (effectiveEmployeeId) {
      return effectiveEmployeeId;
    }
    try {
      const savedEmployee = await handleSaveDraftWithReset();
      const savedEmployeeId = savedEmployee?.id || null;
      if (savedEmployeeId) {
        draftEmployeeIdRef.current = savedEmployeeId;
      }
      return savedEmployeeId;
    } catch {
      return null;
    }
  }, [employee?.id, handleSaveDraftWithReset]);

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
        const savedEmployee = await handleSaveDraftWithReset();
        if (savedEmployee?.id) {
          draftEmployeeIdRef.current = savedEmployee.id;
          lastAutoSavedHashRef.current = hash;
        }
      } finally {
        autoSavingRef.current = false;
      }
    }, 600);
  }, [employee?.id, form, handleSaveDraftWithReset]);

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
          messageApi.error(
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
    messageApi,
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

  const handleLastNameBlur = useCallback(() => {
    scheduleAutoSaveDraft();
  }, [scheduleAutoSaveDraft]);

  const handleFormFieldsChange = useCallback(() => {
    isFormResetRef.current = false;
    if (canSaveTimeoutRef.current) {
      clearTimeout(canSaveTimeoutRef.current);
    }
    canSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await form.validateFields({ validateOnly: true });
        setCanSave(true);
      } catch {
        setCanSave(false);
      }
    }, 200);
  }, [form]);

  const shouldPromptDraftOnClose = useCallback(() => {
    if (startedWithExistingEmployeeRef.current) {
      return false;
    }

    const currentSnapshot = JSON.stringify(form.getFieldsValue(true));
    const isDirty =
      form.isFieldsTouched(true) &&
      currentSnapshot !== lastSavedSnapshotRef.current;

    return isDirty || Boolean(draftEmployeeIdRef.current);
  }, [form, lastSavedSnapshotRef]);

  const saveDraftBeforeClose = useCallback(async () => {
    isExplicitlySavedRef.current = true;
    return handleSaveDraftWithReset();
  }, [handleSaveDraftWithReset]);

  const discardDraftOnClose = useCallback(async () => {
    if (isExplicitlySavedRef.current) {
      return false;
    }

    if (startedWithExistingEmployeeRef.current) {
      return false;
    }

    const draftEmployeeId = draftEmployeeIdRef.current;
    if (!draftEmployeeId) {
      return false;
    }

    await employeeApi.discardDraft(draftEmployeeId);
    draftEmployeeIdRef.current = null;
    lastAutoSavedHashRef.current = null;
    return true;
  }, []);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (canSaveTimeoutRef.current) {
        clearTimeout(canSaveTimeoutRef.current);
      }
      if (latinErrorTimeoutRef.current) {
        clearTimeout(latinErrorTimeoutRef.current);
      }
    };
  }, []);

  return {
    canSave,
    latinInputError,
    ensureEmployeeId,
    handleSaveWithReset,
    handleSaveDraftWithReset,
    handleInnBlur,
    handleLastNameBlur,
    handleFullNameChange,
    handleFormFieldsChange,
    shouldPromptDraftOnClose,
    saveDraftBeforeClose,
    discardDraftOnClose,
  };
};
