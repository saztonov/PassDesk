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

const FIO_FIELDS = ["lastName", "firstName", "middleName"];
const PRIMARY_FIO_DOCUMENT_TYPES = new Set(["passport_translation"]);

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
      const isPrimaryFioSource = PRIMARY_FIO_DOCUMENT_TYPES.has(docType);

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

        if (ocrDocumentType === "foreign_passport") {
          formPatch.passportType = "foreign";
        }

        // Fallback: если citizenshipId не заполнился — ищем вручную по имени/коду
        if (!formPatch.citizenshipId && normalized.citizenship) {
          const raw = String(normalized.citizenship).trim();
          const parts = raw.toUpperCase().split(/[/,|\s]+/).filter((p) => p.length >= 2);
          const NAME_TO_ISO3 = {
            TAJIKISTAN: "TJK", ТОЧИКИСТОН: "TJK", ТАДЖИКИСТАН: "TJK",
            UZBEKISTAN: "UZB", УЗБЕКИСТАН: "UZB", ЎЗБЕКИСТОН: "UZB",
            KAZAKHSTAN: "KAZ", КАЗАХСТАН: "KAZ", ҚАЗАҚСТАН: "KAZ",
            KYRGYZSTAN: "KGZ", КЫРГЫЗСТАН: "KGZ", КИРГИЗИЯ: "KGZ",
            AZERBAIJAN: "AZE", АЗЕРБАЙДЖАН: "AZE",
            ARMENIA: "ARM", АРМЕНИЯ: "ARM", ՀԱՅԱՍՏԱՆ: "ARM",
            BELARUS: "BLR", БЕЛАРУСЬ: "BLR", БЕЛОРУССИЯ: "BLR",
            UKRAINE: "UKR", УКРАИНА: "UKR",
            MOLDOVA: "MDA", МОЛДОВА: "MDA", МОЛДАВИЯ: "MDA",
            TURKEY: "TUR", ТУРЦИЯ: "TUR", TÜRKIYE: "TUR",
            RUSSIA: "RUS", РОССИЯ: "RUS",
            SERBIA: "SRB", СЕРБИЯ: "SRB",
            IRAN: "IRN", ИРАН: "IRN",
          };
          for (const part of parts) {
            const iso3 = NAME_TO_ISO3[part] || (part.length === 3 ? part : null);
            if (iso3) {
              const found = citizenships.find(
                (c) => String(c.code || "").toUpperCase() === iso3,
              );
              if (found) { formPatch.citizenshipId = found.id; break; }
            }
          }
        }

        console.log("[OCR] normalized:", normalized);
        console.log("[OCR] citizenships count:", citizenships?.length);
        console.log("[OCR] formPatch:", formPatch);

        if (Object.keys(formPatch).length === 0) {
          messageApi?.warning?.("Не удалось извлечь данные для автозаполнения");
          return;
        }

        const currentValues = form.getFieldsValue(true);
        const { autoFillPatch, conflicts } = buildOcrApplyPlan({
          currentValues,
          ocrPatch: formPatch,
          overwriteFields: isPrimaryFioSource ? FIO_FIELDS : [],
          skipConflictFields: isPrimaryFioSource ? [] : FIO_FIELDS,
        });

        if (ocrDocumentType === "foreign_passport") {
          autoFillPatch.passportType = "foreign";
          delete conflicts.passportType;
        }

        console.log("[OCR] currentValues:", currentValues);
        console.log("[OCR] autoFillPatch:", autoFillPatch);
        console.log("[OCR] conflicts:", conflicts);

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
