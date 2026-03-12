import { useCallback, useEffect, useRef, useState } from "react";
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
  employeeId = null,
  visible = true,
}) => {
  const [processingMap, setProcessingMap] = useState({});
  const [conflictSummary, setConflictSummary] = useState(null);
  const [isConflictSummaryLoading, setIsConflictSummaryLoading] = useState(false);
  const runningFileIdsRef = useRef(new Set());

  const refreshConflictSummary = useCallback(
    async (targetEmployeeId = employeeId) => {
      const normalizedEmployeeId = normalizeString(targetEmployeeId);
      if (!normalizedEmployeeId) {
        setConflictSummary(null);
        return null;
      }

      setIsConflictSummaryLoading(true);
      try {
        const response = await ocrService.getEmployeeConflictSummary(
          normalizedEmployeeId,
        );
        const responseData = toResponseData(response);
        setConflictSummary(responseData);
        return responseData;
      } catch (error) {
        console.error("Failed to load OCR conflict summary:", error);
        return null;
      } finally {
        setIsConflictSummaryLoading(false);
      }
    },
    [employeeId],
  );

  useEffect(() => {
    if (!visible) {
      setConflictSummary(null);
      return;
    }

    if (!employeeId) {
      setConflictSummary(null);
      return;
    }

    refreshConflictSummary(employeeId);
  }, [employeeId, refreshConflictSummary, visible]);

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

        const autoFillCount = Object.keys(autoFillPatch).length;
        if (autoFillCount > 0) {
          messageApi?.success?.(
            `OCR: заполнено полей ${autoFillCount}`,
          );
        } else {
          messageApi?.info?.(
            "OCR: документ распознан, автозаполнение не потребовалось",
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
            conflicts: Object.values(conflicts || {}),
          });
          const summary = await refreshConflictSummary(employeeId);
          if (summary?.hasConflicts) {
            messageApi?.warning?.(
              `OCR: найдены расхождения (${summary.conflictsCount})`,
            );
          } else {
            messageApi?.info?.(
              "OCR сохранен. Расхождений не найдено.",
            );
          }
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
    [
      citizenships,
      dateOutputMode,
      form,
      getPassportType,
      messageApi,
      refreshConflictSummary,
    ],
  );

  return {
    conflictSummary,
    isConflictSummaryLoading,
    isOcrProcessing: Object.keys(processingMap).length > 0,
    handleUploadedFileForOcr,
    refreshConflictSummary,
  };
};

export default useEmployeeOcrHandlers;
