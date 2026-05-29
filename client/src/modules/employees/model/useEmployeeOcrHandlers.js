import { useCallback, useEffect, useRef, useState } from "react";
import ocrService from "@/services/ocrService";
import {
  buildFormPatchFromOcr,
  buildOcrApplyPlan,
  normalizeString,
  resolveCitizenshipIdByOcrCode,
  resolveOcrDocumentTypeByFile,
  isPassportMainPageNormalized,
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

const toDigits = (value = "") => String(value || "").replace(/[^\d]/g, "");
const MAX_GLOBAL_OCR_KEYS_PER_EMPLOYEE = 500;
const processedOcrEventKeysByEmployee = new Map();

const getProcessedOcrKeysForEmployee = (employeeId) => {
  const normalizedEmployeeId = normalizeString(employeeId);
  if (!normalizedEmployeeId) {
    return null;
  }

  let keys = processedOcrEventKeysByEmployee.get(normalizedEmployeeId);
  if (!keys) {
    keys = new Set();
    processedOcrEventKeysByEmployee.set(normalizedEmployeeId, keys);
  }
  return keys;
};

const rememberProcessedOcrEventKey = (employeeId, eventKey) => {
  const employeeKeys = getProcessedOcrKeysForEmployee(employeeId);
  if (!employeeKeys || !eventKey) {
    return;
  }

  employeeKeys.add(eventKey);
  if (employeeKeys.size <= MAX_GLOBAL_OCR_KEYS_PER_EMPLOYEE) {
    return;
  }

  const staleKeys = Array.from(employeeKeys).slice(
    0,
    employeeKeys.size - MAX_GLOBAL_OCR_KEYS_PER_EMPLOYEE,
  );
  staleKeys.forEach((key) => employeeKeys.delete(key));
};

const toOcrResultFingerprint = (ocrResult = null) => {
  if (!ocrResult || typeof ocrResult !== "object") {
    return "";
  }

  const normalized =
    ocrResult.normalized ||
    ocrResult?.data?.normalized ||
    ocrResult?.result?.normalized ||
    null;

  if (normalized && typeof normalized === "object") {
    try {
      return JSON.stringify(normalized);
    } catch {
      return "";
    }
  }

  return normalizeString(
    ocrResult.id ||
      ocrResult.jobId ||
      ocrResult.providerMessageId ||
      ocrResult.requestId,
  );
};

const shouldRetryPassportAsRussian = (normalized = {}) => {
  const passportNumberDigits = toDigits(normalized?.passportNumber);
  const citizenship = normalizeString(normalized?.citizenship).toUpperCase();
  const hasDepartmentCode = Boolean(
    normalizeString(normalized?.passportDepartmentCode),
  );
  const hasRussianSeries = toDigits(normalized?.passportSeries).length === 4;

  if (hasDepartmentCode || hasRussianSeries) {
    return false;
  }

  return (
    passportNumberDigits.length >= 9 &&
    (citizenship === "RUS" || citizenship === "RU")
  );
};

const scoreRussianPassportNormalized = (normalized = {}) => {
  const passportSeriesDigits = toDigits(normalized?.passportSeries);
  const passportNumberDigits = toDigits(normalized?.passportNumber);
  const departmentCode = normalizeString(normalized?.passportDepartmentCode);
  const issuedAt = normalizeString(normalized?.passportIssuedAt);
  const issuedBy = normalizeString(normalized?.passportIssuedBy);
  const lastName = normalizeString(normalized?.lastName);
  const firstName = normalizeString(normalized?.firstName);
  const birthDate = normalizeString(normalized?.birthDate);

  let score = 0;

  if (/^\d{3}-\d{3}$/.test(departmentCode)) score += 8;
  if (passportSeriesDigits.length === 4) score += 4;
  if (passportNumberDigits.length === 6) score += 4;
  if (passportSeriesDigits.length === 4 && passportNumberDigits.length === 6) {
    score += 3;
  }
  if (issuedAt) score += 2;
  if (issuedBy) score += 2;
  if (lastName) score += 1;
  if (firstName) score += 1;
  if (birthDate) score += 1;

  return score;
};

export const useEmployeeOcrHandlers = ({
  form,
  citizenships = [],
  getPassportType,
  onAutofillApplied,
  messageApi,
  dateOutputMode = "dayjs",
  employeeId = null,
  visible = true,
}) => {
  const [processingMap, setProcessingMap] = useState({});
  const [conflictSummary, setConflictSummary] = useState(null);
  const [isConflictSummaryLoading, setIsConflictSummaryLoading] = useState(false);
  const runningFileIdsRef = useRef(new Set());
  const processedOcrEventKeysRef = useRef(new Set());
  const lastHandledAtByFileRef = useRef(new Map());
  // Защита от stale async callback: фиксируем «версию» активной карточки
  // (employeeId + generation), чтобы дорезолвившийся в фоне OCR-промис
  // от предыдущей карточки не писал данные в форму новой карточки.
  const activeEmployeeIdRef = useRef(employeeId || null);
  const activeGenerationRef = useRef(0);
  const visibleRef = useRef(visible);

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
    processedOcrEventKeysRef.current = new Set();
    runningFileIdsRef.current = new Set();
    lastHandledAtByFileRef.current = new Map();
    activeEmployeeIdRef.current = employeeId || null;
    activeGenerationRef.current += 1;
  }, [employeeId]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

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
    async ({ file, employeeId, fileDocumentType, ocrResult }) => {
      const fileId = normalizeString(file?.id);
      const docType = normalizeString(
        fileDocumentType || file?.documentType || file?.document_type,
      ).toLowerCase();
      const hasPersistedOcrMetadata = Boolean(
        file?.ocrVerifiedAt || file?.ocr_verified_at,
      );
      const verifiedMarker = normalizeString(
        file?.ocrVerifiedAt ||
          file?.ocr_verified_at ||
          ocrResult?.ocrVerifiedAt ||
          ocrResult?.data?.ocrVerifiedAt ||
          ocrResult?.verifiedAt ||
          ocrResult?.data?.verifiedAt ||
          ocrResult?.updatedAt ||
          ocrResult?.data?.updatedAt,
      );
      const fingerprint = verifiedMarker ? "" : toOcrResultFingerprint(ocrResult);
      const ocrEventKey = verifiedMarker
        ? `${fileId}:verified:${verifiedMarker}`
        : fingerprint
          ? `${fileId}:fingerprint:${fingerprint}`
          : "";
      const passportType =
        typeof getPassportType === "function"
          ? getPassportType()
          : normalizeString(form.getFieldValue("passportType") || "");

      const ocrDocumentType = resolveOcrDocumentTypeByFile(docType, passportType);

      if (!fileId || !employeeId || !ocrDocumentType) {
        return;
      }

      // Канал 1.1: фиксируем «версию» карточки на старте обработки.
      // Если пользователь переключится на другого сотрудника, пока висит
      // await recognizeDocument, isStillActive() вернёт false и мы не будем
      // писать чужие данные в форму новой карточки.
      const handlerEmployeeId = normalizeString(employeeId);
      const handlerGeneration = activeGenerationRef.current;
      const isStillActive = () =>
        activeGenerationRef.current === handlerGeneration &&
        normalizeString(activeEmployeeIdRef.current) === handlerEmployeeId &&
        visibleRef.current !== false;

      // Канал 1.2a: owner-check на клиенте — если payload-файл уже знает
      // своего владельца и он не совпадает с employeeId хука, это
      // cross-employee применение, бросаем сразу.
      const ownerEmployeeId = normalizeString(
        file?.employeeId || file?.employee_id || file?.ownerEmployeeId,
      );
      if (ownerEmployeeId && ownerEmployeeId !== handlerEmployeeId) {
        console.warn("[OCR] skip cross-employee apply", {
          fileId,
          ownerEmployeeId,
          handlerEmployeeId,
        });
        return;
      }

      const lastHandledAt = lastHandledAtByFileRef.current.get(fileId) || 0;
      if (!ocrEventKey && Date.now() - lastHandledAt < 10000) {
        return;
      }

      const globalProcessedOcrKeys = getProcessedOcrKeysForEmployee(employeeId);
      if (
        ocrEventKey &&
        (processedOcrEventKeysRef.current.has(ocrEventKey) ||
          globalProcessedOcrKeys?.has(ocrEventKey))
      ) {
        return;
      }

      if (runningFileIdsRef.current.has(fileId)) {
        return;
      }

      runningFileIdsRef.current.add(fileId);
      setProcessingMap((prev) => ({ ...prev, [fileId]: true }));
      let handledSuccessfully = false;

      try {
        let effectiveOcrDocumentType = ocrDocumentType;

        let responseData =
          ocrResult && typeof ocrResult === "object" ? ocrResult : null;

        if (!responseData) {
          if (!isStillActive()) {
            console.warn("[OCR] stale callback dropped before recognize", {
              fileId,
              handlerEmployeeId,
            });
            return;
          }
          const response = await ocrService.recognizeDocument({
            fileId,
            employeeId,
            documentType: effectiveOcrDocumentType,
          });
          responseData = toResponseData(response);
        }
        let normalized = toNormalizedPayload(responseData);

        if (
          !hasPersistedOcrMetadata &&
          docType === "passport" &&
          effectiveOcrDocumentType === "foreign_passport" &&
          normalized &&
          shouldRetryPassportAsRussian(normalized)
        ) {
          try {
            if (!isStillActive()) {
              console.warn("[OCR] stale callback dropped before russian fallback", {
                fileId,
                handlerEmployeeId,
              });
              return;
            }
            const russianResponse = await ocrService.recognizeDocument({
              fileId,
              employeeId,
              documentType: "passport_rf",
            });

            const russianResponseData = toResponseData(russianResponse);
            const russianNormalized = toNormalizedPayload(russianResponseData);

            if (russianNormalized) {
              const currentScore = scoreRussianPassportNormalized(normalized);
              const russianScore =
                scoreRussianPassportNormalized(russianNormalized);

              if (russianScore >= currentScore) {
                responseData = russianResponseData;
                normalized = russianNormalized;
                effectiveOcrDocumentType = "passport_rf";
              }
            }
          } catch (fallbackError) {
            console.warn(
              "[OCR] passport fallback to passport_rf failed:",
              fallbackError,
            );
          }
        }

        if (!normalized || typeof normalized !== "object") {
          handledSuccessfully = true;
          messageApi?.warning?.("OCR не вернул распознанные поля");
          return;
        }

        const isPassportMainPage =
          docType === "passport" &&
          effectiveOcrDocumentType === "passport_rf" &&
          isPassportMainPageNormalized(normalized);

        let formPatch = buildFormPatchFromOcr({
          normalized,
          citizenships,
          dateOutputMode,
        });

        if (
          docType === "passport" &&
          effectiveOcrDocumentType === "passport_rf" &&
          !isPassportMainPage
        ) {
          formPatch = formPatch.registrationAddress
            ? { registrationAddress: formPatch.registrationAddress }
            : {};
        }

        if (effectiveOcrDocumentType === "foreign_passport") {
          formPatch.passportType = "foreign";
        } else if (
          docType === "passport" &&
          effectiveOcrDocumentType === "passport_rf"
        ) {
          formPatch.passportType = "russian";
        }

        // Fallback: если citizenshipId не заполнился — ищем вручную по имени/коду
        if (!formPatch.citizenshipId && normalized.citizenship) {
          formPatch.citizenshipId = resolveCitizenshipIdByOcrCode(
            citizenships,
            normalized.citizenship,
          );
          if (formPatch.citizenshipId && !formPatch.birthCountryId) {
            formPatch.birthCountryId = formPatch.citizenshipId;
          }
        }

        if (Object.keys(formPatch).length === 0) {
          if (
            docType === "passport" &&
            effectiveOcrDocumentType === "passport_rf" &&
            !isPassportMainPage
          ) {
            messageApi?.warning?.(
              "Похоже, это не основная страница паспорта. Автозаполнение и расхождения пропущены.",
            );
          } else {
            handledSuccessfully = true;
            messageApi?.warning?.("Не удалось извлечь данные для автозаполнения");
            return;
          }
        }

        const currentValues = form.getFieldsValue(true);
        const isPassportDocument =
          effectiveOcrDocumentType === "passport_rf" ||
          effectiveOcrDocumentType === "foreign_passport" ||
          effectiveOcrDocumentType === "passport_translation";
        const { autoFillPatch, conflicts } = buildOcrApplyPlan({
          currentValues,
          ocrPatch: formPatch,
          overwriteFields: [
            ...(docType === "passport_translation" ? Object.keys(formPatch) : []),
            ...(isPassportDocument && formPatch.gender ? ["gender"] : []),
          ],
        });

        if (
          effectiveOcrDocumentType === "foreign_passport" ||
          effectiveOcrDocumentType === "passport_translation"
        ) {
          autoFillPatch.passportType = "foreign";
          delete conflicts.passportType;
        } else if (
          docType === "passport" &&
          effectiveOcrDocumentType === "passport_rf"
        ) {
          autoFillPatch.passportType = "russian";
          delete conflicts.passportType;
        }

        if (Object.keys(autoFillPatch).length > 0) {
          if (!isStillActive()) {
            console.warn("[OCR] stale callback dropped before setFieldsValue", {
              fileId,
              handlerEmployeeId,
              activeEmployeeId: normalizeString(activeEmployeeIdRef.current),
            });
            return;
          }
          form.setFieldsValue(autoFillPatch);
          if (typeof onAutofillApplied === "function") {
            try {
              onAutofillApplied(autoFillPatch, form.getFieldsValue(true));
            } catch (callbackError) {
              console.warn("[OCR] onAutofillApplied callback failed:", callbackError);
            }
          }
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
          if (!isStillActive()) {
            console.warn("[OCR] stale callback dropped before confirmFileOcr", {
              fileId,
              handlerEmployeeId,
            });
            handledSuccessfully = true;
            return;
          }
          const provider = toProvider(responseData);
          const resultFileId = toFileId(responseData, fileId);

          await ocrService.confirmFileOcr({
            fileId: resultFileId,
            employeeId,
            provider,
            result: {
              documentType: effectiveOcrDocumentType,
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
        handledSuccessfully = true;
      } catch (error) {
        console.error("OCR error:", error);
        messageApi?.error?.(
          error?.response?.data?.message || "Ошибка OCR распознавания",
        );
      } finally {
        if (handledSuccessfully && ocrEventKey) {
          processedOcrEventKeysRef.current.add(ocrEventKey);
          rememberProcessedOcrEventKey(employeeId, ocrEventKey);
        }
        if (handledSuccessfully) {
          lastHandledAtByFileRef.current.set(fileId, Date.now());
        }
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
      onAutofillApplied,
      refreshConflictSummary,
    ],
  );

  return {
    conflictSummary,
    isConflictSummaryLoading,
    isOcrProcessing: Object.keys(processingMap).length > 0,
    processingMap,
    handleUploadedFileForOcr,
    refreshConflictSummary,
  };
};

export default useEmployeeOcrHandlers;
