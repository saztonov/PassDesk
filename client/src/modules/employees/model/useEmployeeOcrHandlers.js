import { useCallback, useMemo, useRef, useState } from "react";
import ocrService from "@/services/ocrService";
import {
  buildFormPatchFromOcr,
  buildOcrApplyPlan,
  normalizeString,
  resolveOcrDocumentTypeByFile,
} from "@/modules/employees/lib/employeeOcrUtils";

const toResponseData = (response) => response?.data || response || {};

const toNormalizedPayload = (responseData = {}) =>
  responseData.normalized || responseData?.data?.normalized || null;

const toProvider = (responseData = {}) =>
  normalizeString(responseData.provider || responseData?.data?.provider) ||
  "openrouter";

const toFileId = (responseData = {}, fallbackFileId = null) =>
  normalizeString(responseData.fileId || responseData?.data?.fileId) ||
  fallbackFileId;

export const useEmployeeOcrHandlers = ({
  form,
  citizenships = [],
  getPassportType,
  messageApi,
  dateOutputMode = "dayjs",
}) => {
  const [conflictsMap, setConflictsMap] = useState({});
  const [processingMap, setProcessingMap] = useState({});
  const runningFileIdsRef = useRef(new Set());

  const hasConflicts = useMemo(
    () => Object.keys(conflictsMap).length > 0,
    [conflictsMap],
  );

  const conflictsList = useMemo(
    () => Object.values(conflictsMap),
    [conflictsMap],
  );

  const clearConflicts = useCallback(() => {
    setConflictsMap({});
  }, []);

  const removeConflict = useCallback((fieldName) => {
    setConflictsMap((prev) => {
      if (!prev[fieldName]) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }, []);

  const keepConflictValue = useCallback(
    (fieldName) => {
      removeConflict(fieldName);
    },
    [removeConflict],
  );

  const replaceConflictValue = useCallback(
    (fieldName) => {
      const conflict = conflictsMap[fieldName];
      if (!conflict) return;

      form.setFieldValue(fieldName, conflict.ocrValue);
      removeConflict(fieldName);
    },
    [conflictsMap, form, removeConflict],
  );

  const keepAllConflicts = useCallback(() => {
    setConflictsMap({});
  }, []);

  const replaceAllConflicts = useCallback(() => {
    const patch = {};
    Object.values(conflictsMap).forEach((conflict) => {
      patch[conflict.fieldName] = conflict.ocrValue;
    });

    if (Object.keys(patch).length > 0) {
      form.setFieldsValue(patch);
    }

    setConflictsMap({});
  }, [conflictsMap, form]);

  const handleUploadedFileForOcr = useCallback(
    async ({ file, employeeId, fileDocumentType }) => {
      const fileId = normalizeString(file?.id);
      const docType = normalizeString(
        fileDocumentType || file?.documentType || file?.document_type,
      ).toLowerCase();
      const passportType =
        typeof getPassportType === "function"
          ? getPassportType()
          : normalizeString(form.getFieldValue("passportType") || "");

      const ocrDocumentType = resolveOcrDocumentTypeByFile(docType, passportType);

      if (!fileId || !employeeId || !ocrDocumentType) {
        return;
      }

      if (runningFileIdsRef.current.has(fileId)) {
        return;
      }

      runningFileIdsRef.current.add(fileId);
      setProcessingMap((prev) => ({ ...prev, [fileId]: true }));

      try {
        const response = await ocrService.recognizeDocument({
          fileId,
          employeeId,
          documentType: ocrDocumentType,
        });

        const responseData = toResponseData(response);
        const normalized = toNormalizedPayload(responseData);
        if (!normalized || typeof normalized !== "object") {
          messageApi?.warning?.("OCR не вернул распознанные поля");
          return;
        }

        const formPatch = buildFormPatchFromOcr({
          normalized,
          citizenships,
          dateOutputMode,
        });

        if (Object.keys(formPatch).length === 0) {
          messageApi?.warning?.("Не удалось извлечь данные для автозаполнения");
          return;
        }

        const currentValues = form.getFieldsValue(true);
        const { autoFillPatch, conflicts } = buildOcrApplyPlan({
          currentValues,
          ocrPatch: formPatch,
        });

        if (Object.keys(autoFillPatch).length > 0) {
          form.setFieldsValue(autoFillPatch);
        }

        if (Object.keys(conflicts).length > 0) {
          const decoratedConflicts = Object.fromEntries(
            Object.entries(conflicts).map(([fieldName, conflict]) => [
              fieldName,
              {
                ...conflict,
                fileId,
                fileName: file?.fileName || file?.originalName || file?.name || null,
                fileDocumentType: docType,
                ocrDocumentType,
              },
            ]),
          );

          setConflictsMap((prev) => ({
            ...prev,
            ...decoratedConflicts,
          }));
        }

        const autoFillCount = Object.keys(autoFillPatch).length;
        const conflictsCount = Object.keys(conflicts).length;

        if (autoFillCount > 0 && conflictsCount === 0) {
          messageApi?.success?.(
            `OCR: заполнено полей ${autoFillCount}`,
          );
        } else if (autoFillCount > 0 && conflictsCount > 0) {
          messageApi?.warning?.(
            `OCR: заполнено ${autoFillCount}, обнаружено расхождений ${conflictsCount}`,
          );
        } else if (conflictsCount > 0) {
          messageApi?.warning?.(
            `OCR: обнаружено расхождений ${conflictsCount}`,
          );
        }

        try {
          const provider = toProvider(responseData);
          const resultFileId = toFileId(responseData, fileId);

          await ocrService.confirmFileOcr({
            fileId: resultFileId,
            provider,
            result: {
              documentType: ocrDocumentType,
              normalized,
            },
          });
        } catch (confirmError) {
          console.error("Failed to confirm OCR metadata:", confirmError);
        }
      } catch (error) {
        console.error("OCR error:", error);
        messageApi?.error?.(
          error?.response?.data?.message || "Ошибка OCR распознавания",
        );
      } finally {
        runningFileIdsRef.current.delete(fileId);
        setProcessingMap((prev) => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }
    },
    [citizenships, dateOutputMode, form, getPassportType, messageApi],
  );

  return {
    conflictsMap,
    conflictsList,
    hasConflicts,
    isOcrProcessing: Object.keys(processingMap).length > 0,
    handleUploadedFileForOcr,
    keepConflictValue,
    replaceConflictValue,
    keepAllConflicts,
    replaceAllConflicts,
    clearConflicts,
  };
};

export default useEmployeeOcrHandlers;
