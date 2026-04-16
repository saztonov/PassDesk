import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Col, Row, Spin, List, Space, Tag, Alert } from "antd";
import { FileViewer } from "../../shared/ui/FileViewer";
import { employeeService } from "../../services/employeeService";
import DocumentTypeUploaderItem from "@/modules/employees/ui/DocumentTypeUploaderItem";
import DocumentTypeUploaderSampleModal from "@/modules/employees/ui/DocumentTypeUploaderSampleModal";
import EmployeeDocumentPreviewPane from "@/modules/employees/ui/EmployeeDocumentPreviewPane";
import {
  DEFAULT_DOCUMENT_TYPES,
  DOCUMENT_TYPE_UPLOADER_STYLES,
  normalizeDocumentTypes,
  splitIntoColumns,
} from "@/modules/employees/lib/documentTypeUploaderUtils";
import {
  MAX_QUEUE_BATCH_SIZE,
  getSeenOcrResultKeysForEmployee,
  rememberSeenOcrResultKey,
  prepareFileForUpload,
} from "@/modules/employees/lib/documentTypeUploaderAiUtils";
import { applyDocumentTypeProfile } from "@/modules/employees/lib/documentTypeProfiles";
import { SUPPORTED_FORMATS } from "@/shared/constants/fileTypes";

/**
 * Компонент для загрузки документов по типам с автоматической загрузкой
 * Каждый тип документа имеет отдельную кнопку с множественным выбором файлов
 */
const DocumentTypeUploader = ({
  employeeId,
  ensureEmployeeId,
  onFilesUpdated,
  onUploadComplete,
  onRerunOcr,
  onOcrActivityChange,
  ocrProcessingMap = null,
  readonly = false,
  profileCode,
  profilesConfig,
  viewerMode = "modal",
  columnsCount = 3,
  showInfoBanner = true,
  embeddedViewerHeight: _embeddedViewerHeight = 360,
  compact = false,
}) => {
  const { message } = App.useApp();
  const [dataState, setDataState] = useState({
    uploadingTypes: {},
    allFiles: [],
    documentTypes: DEFAULT_DOCUMENT_TYPES,
    loadingDocumentTypes: false,
  });
  const [uploadQueue, setUploadQueue] = useState([]);
  const [ocrQueue, setOcrQueue] = useState([]);
  const [lastQueueNotice, setLastQueueNotice] = useState(null);
  const ocrQueueInitializedRef = useRef(false);
  const ocrStatusByJobRef = useRef(new Map());
  const lastCompletedCountRef = useRef(0);
  const lastQueueLengthRef = useRef(0);
  const lastOcrCompletedCountRef = useRef(0);
  const lastOcrQueueLengthRef = useRef(0);
  const [lastUploadByType, setLastUploadByType] = useState({});
  const lastFilesCountRef = useRef({});
  const [lastUploadEvents, setLastUploadEvents] = useState([]);
  const seenFileIdsRef = useRef(new Set());
  const seenOcrResultsRef = useRef(new Set());
  const seenOcrFileIdsRef = useRef(new Set());
  const initializedFilesRef = useRef(false);
  const [uiState, setUiState] = useState({
    viewerVisible: false,
    viewingFile: null,
    sampleModalVisible: false,
    selectedSampleDocType: null,
  });
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState(null);
  const uploadingRef = useRef(new Set());
  const ensureEmployeeIdPromiseRef = useRef(null);
  const effectiveEmployeeId = employeeId || resolvedEmployeeId;
  const { uploadingTypes, allFiles, documentTypes, loadingDocumentTypes } =
    dataState;
  const {
    viewerVisible,
    viewingFile,
    sampleModalVisible,
    selectedSampleDocType,
  } = uiState;

  useEffect(() => {
    initializedFilesRef.current = false;
    seenFileIdsRef.current = new Set();
    seenOcrResultsRef.current = new Set();
    seenOcrFileIdsRef.current = new Set();
  }, [effectiveEmployeeId]);

  // server-backed queue
  const profileDocumentTypes = useMemo(
    () =>
      applyDocumentTypeProfile({
        documentTypes,
        profileCode,
        profilesConfig,
      }),
    [documentTypes, profileCode, profilesConfig],
  );

  const resolveEmployeeId = useCallback(async () => {
    if (effectiveEmployeeId) {
      return effectiveEmployeeId;
    }
    if (!ensureEmployeeId) {
      message.error("Сначала сохраните черновик сотрудника");
      return null;
    }

    if (ensureEmployeeIdPromiseRef.current) {
      return ensureEmployeeIdPromiseRef.current;
    }

    ensureEmployeeIdPromiseRef.current = (async () => {
      try {
        const newEmployeeId = await ensureEmployeeId();
        if (newEmployeeId) {
          setResolvedEmployeeId(newEmployeeId);
          return newEmployeeId;
        }
        message.error("Не удалось создать черновик сотрудника");
        return null;
      } catch {
        message.error("Не удалось создать черновик сотрудника");
        return null;
      } finally {
        ensureEmployeeIdPromiseRef.current = null;
      }
    })();

    return ensureEmployeeIdPromiseRef.current;
  }, [effectiveEmployeeId, ensureEmployeeId, message]);

  const fetchAllFiles = useCallback(
    async (targetEmployeeId = effectiveEmployeeId, options = {}) => {
      try {
        if (!targetEmployeeId) {
          setDataState((prev) => ({ ...prev, allFiles: [] }));
          return;
        }
        const response = await employeeService.getFiles(
          targetEmployeeId,
          options,
        );
        const files = response?.data || response || [];
        setDataState((prev) => ({ ...prev, allFiles: files }));
      } catch (error) {
        console.error("Error loading files:", error);
        message.error("Ошибка загрузки файлов");
      }
    },
    [effectiveEmployeeId, message],
  );

  useEffect(() => {
    fetchAllFiles();
  }, [fetchAllFiles]);

  const fetchDocumentTypes = useCallback(async () => {
    setDataState((prev) => ({ ...prev, loadingDocumentTypes: true }));
    try {
      const response = await employeeService.getDocumentTypes();
      const types = response?.data || response || [];
      setDataState((prev) => ({
        ...prev,
        documentTypes: normalizeDocumentTypes(types),
      }));
    } catch (error) {
      console.error("Error loading document types:", error);
      setDataState((prev) => ({
        ...prev,
        documentTypes: DEFAULT_DOCUMENT_TYPES,
      }));
      message.warning(
        "Не удалось загрузить типы документов из БД. Используется базовый список.",
      );
    } finally {
      setDataState((prev) => ({ ...prev, loadingDocumentTypes: false }));
    }
  }, [message]);

  useEffect(() => {
    fetchDocumentTypes();
  }, [fetchDocumentTypes]);

  const getFilesForType = useCallback(
    (documentType) =>
      allFiles.filter((file) => file.documentType === documentType),
    [allFiles],
  );

  const getDocumentTypeLabel = useCallback(
    (documentTypeValue) =>
      profileDocumentTypes.find((item) => item.value === documentTypeValue)
        ?.label || documentTypeValue,
    [profileDocumentTypes],
  );

  const getQueuedCountForType = useCallback(
    (documentTypeValue) =>
      uploadQueue.filter(
        (item) =>
          item.documentType === documentTypeValue &&
          item.status !== "completed" &&
          item.status !== "done",
      ).length,
    [uploadQueue],
  );

  const handleOpenSample = useCallback((docType) => {
    setUiState((prev) => ({
      ...prev,
      selectedSampleDocType: docType,
      sampleModalVisible: true,
    }));
  }, []);

  const fetchUploadQueue = useCallback(async () => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      const response = await employeeService.getUploadQueue(
        effectiveEmployeeId,
      );
      const queueItems = Array.isArray(response?.data) ? response.data : [];
      setUploadQueue(queueItems);
      const completedCount = queueItems.filter(
        (item) => item.status === "completed" || item.status === "done",
      ).length;
      if (completedCount > lastCompletedCountRef.current) {
        lastCompletedCountRef.current = completedCount;
        await fetchAllFiles(effectiveEmployeeId, { force: true });
      }
    } catch (error) {
      console.error("Failed to load upload queue:", error);
    }
  }, [effectiveEmployeeId, fetchAllFiles]);

  const fetchOcrQueue = useCallback(async () => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      const response = await employeeService.getOcrQueue(effectiveEmployeeId);
      const queueItems = Array.isArray(response?.data) ? response.data : [];
      setOcrQueue(queueItems);

      const nextStatusByJob = new Map();
      for (const item of queueItems) {
        if (!item?.id) continue;
        nextStatusByJob.set(String(item.id), item.status);
      }

      if (ocrQueueInitializedRef.current) {
        for (const item of queueItems) {
          const itemId = String(item?.id || "");
          if (!itemId) continue;
          const previousStatus = ocrStatusByJobRef.current.get(itemId);
          const currentStatus = item.status;
          if (!previousStatus || previousStatus === currentStatus) {
            continue;
          }

          const label =
            item.fileName ||
            getDocumentTypeLabel(item.documentType) ||
            "Документ";

          if (currentStatus === "failed" || currentStatus === "error") {
            message.error(
              `Ошибка OCR: ${label}${item.error ? ` • ${item.error}` : ""}`,
            );
          }
        }
      }

      ocrStatusByJobRef.current = nextStatusByJob;
      ocrQueueInitializedRef.current = true;

      const completedCount = queueItems.filter(
        (item) => item.status === "completed" || item.status === "done",
      ).length;
      if (completedCount > lastOcrCompletedCountRef.current) {
        lastOcrCompletedCountRef.current = completedCount;
        await fetchAllFiles(effectiveEmployeeId, { force: true });
      }
    } catch (error) {
      console.error("Failed to load OCR queue:", error);
    }
  }, [effectiveEmployeeId, fetchAllFiles, getDocumentTypeLabel, message]);

  useEffect(() => {
    fetchUploadQueue();
  }, [fetchUploadQueue]);

  useEffect(() => {
    fetchOcrQueue();
  }, [fetchOcrQueue]);

  useEffect(() => {
    if (!effectiveEmployeeId) {
      return;
    }

    const hasActiveJobs = uploadQueue.length > 0 || ocrQueue.length > 0;
    const intervalMs = hasActiveJobs ? 2000 : 8000;

    const interval = setInterval(() => {
      fetchUploadQueue();
      fetchOcrQueue();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [effectiveEmployeeId, fetchUploadQueue, fetchOcrQueue, uploadQueue.length, ocrQueue.length]);

  useEffect(() => {
    if (typeof onOcrActivityChange !== "function") {
      return undefined;
    }
    const isTerminalStatus = (status) =>
      ["completed", "done", "failed", "error"].includes(status);

    const normalizedStatuses = ocrQueue.map((item) =>
      String(item?.status || "").toLowerCase(),
    );
    const hasActiveOcrJobs = normalizedStatuses.some(
      (status) => !isTerminalStatus(status),
    );
    const retryingCount = ocrQueue.filter((item) => {
      const status = String(item?.status || "").toLowerCase();
      if (status !== "active" && status !== "waiting" && status !== "delayed") {
        return false;
      }
      return Number(item?.attempts || 0) > 0;
    }).length;
    const staleWaitingCount = ocrQueue.filter((item) => {
      const status = String(item?.status || "").toLowerCase();
      const ageMs = Number(item?.ageMs || 0);
      return (
        (status === "waiting" || status === "delayed") &&
        Number.isFinite(ageMs) &&
        ageMs >= 120000
      );
    }).length;
    const waitingCount = normalizedStatuses.filter(
      (status) => status === "waiting" || status === "delayed",
    ).length;
    const activeCount = normalizedStatuses.filter(
      (status) => status === "active" || status === "uploading",
    ).length;
    const failedCount = normalizedStatuses.filter(
      (status) => status === "failed" || status === "error",
    ).length;

    onOcrActivityChange({
      active: hasActiveOcrJobs,
      total: ocrQueue.length,
      activeCount,
      waitingCount,
      retryingCount,
      staleWaitingCount,
      failedCount,
    });

    return () => {
      onOcrActivityChange({
        active: false,
        total: 0,
        activeCount: 0,
        waitingCount: 0,
        retryingCount: 0,
        staleWaitingCount: 0,
        failedCount: 0,
      });
    };
  }, [ocrQueue, onOcrActivityChange]);

  useEffect(() => {
    if (!effectiveEmployeeId) {
      return;
    }
    const previousLength = lastQueueLengthRef.current;
    if (previousLength > 0 && uploadQueue.length === 0) {
      fetchAllFiles(effectiveEmployeeId, { force: true });
    }
    lastQueueLengthRef.current = uploadQueue.length;
  }, [effectiveEmployeeId, fetchAllFiles, uploadQueue.length]);

  useEffect(() => {
    if (!effectiveEmployeeId) {
      return;
    }
    const previousLength = lastOcrQueueLengthRef.current;
    if (previousLength > 0 && ocrQueue.length === 0) {
      fetchAllFiles(effectiveEmployeeId, { force: true });
    }
    lastOcrQueueLengthRef.current = ocrQueue.length;
  }, [effectiveEmployeeId, fetchAllFiles, ocrQueue.length]);

  useEffect(() => {
    const nextCounts = {};
    for (const file of allFiles) {
      if (!file?.documentType) continue;
      nextCounts[file.documentType] = (nextCounts[file.documentType] || 0) + 1;
    }

    const prevCounts = lastFilesCountRef.current;
    lastFilesCountRef.current = nextCounts;

    setLastUploadByType((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        const prevCount = prevCounts?.[key] || 0;
        const currentCount = nextCounts?.[key] || 0;
        if (currentCount > prevCount && next[key]?.status === "queued") {
          next[key] = {
            ...next[key],
            status: "done",
            doneCount: currentCount - prevCount,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (Object.keys(prevCounts || {}).length > 0) {
      const updatedEvents = [];
      for (const file of allFiles) {
        if (file?.id && seenFileIdsRef.current.has(file.id)) {
          continue;
        }
        const docType = file?.documentType;
        if (!docType) continue;
        const prevCount = prevCounts?.[docType] || 0;
        const currentCount = nextCounts?.[docType] || 0;
        if (currentCount > prevCount) {
          updatedEvents.push({
            id: `done-${file.id}`,
            documentType: docType,
            fileName: file.fileName || file.originalName || "Файл",
            status: "done",
            ts: Date.now(),
          });
          if (file?.id) {
            seenFileIdsRef.current.add(file.id);
          }
        }
      }
      if (updatedEvents.length > 0) {
        setLastUploadEvents((prev) => [...updatedEvents, ...prev].slice(0, 10));
        updatedEvents.forEach((event) => {
          message.success(
            `Загружен: ${getDocumentTypeLabel(event.documentType)} • ${event.fileName}`,
          );
        });
      }
    }
  }, [allFiles, getDocumentTypeLabel, message]);

  useEffect(() => {
    if (!effectiveEmployeeId) {
      return;
    }

    if (!initializedFilesRef.current && allFiles.length > 0) {
      const initialIds = new Set();
      const initialOcrResults = new Set();
      const initialOcrFileIds = new Set();
      for (const file of allFiles) {
        if (file?.id) initialIds.add(file.id);
        if (file?.id && file?.ocrVerifiedAt) {
          const key = `${file.id}:${file.ocrVerifiedAt}`;
          initialOcrResults.add(key);
          initialOcrFileIds.add(file.id);
          rememberSeenOcrResultKey(effectiveEmployeeId, key);
        }
      }
      seenFileIdsRef.current = initialIds;
      seenOcrResultsRef.current = initialOcrResults;
      seenOcrFileIdsRef.current = initialOcrFileIds;
      initializedFilesRef.current = true;
      return;
    }

    if (!initializedFilesRef.current) {
      return;
    }

    const globalSeenKeys = getSeenOcrResultKeysForEmployee(effectiveEmployeeId);
    const nextProcessedKeys = new Set(seenOcrResultsRef.current);
    const newOcrFiles = [];

    for (const file of allFiles) {
      // P0.2 step 2: ocrResultJson больше не приходит в списке файлов.
      // Признаком готового OCR теперь служит флаг hasOcrResult
      // (fallback на ocrResultJson оставлен для обратной совместимости —
      // если сервер ещё не обновлён, старое поле работает).
      const hasOcr = Boolean(file?.hasOcrResult || file?.ocrResultJson);
      if (!file?.id || !hasOcr || !file?.ocrVerifiedAt) {
        continue;
      }
      const key = `${file.id}:${file.ocrVerifiedAt}`;
      if (nextProcessedKeys.has(key) || globalSeenKeys?.has(key)) {
        continue;
      }
      nextProcessedKeys.add(key);
      rememberSeenOcrResultKey(effectiveEmployeeId, key);
      newOcrFiles.push({ file, isRerun: seenOcrFileIdsRef.current.has(file.id) });
      seenOcrFileIdsRef.current.add(file.id);
    }

    if (newOcrFiles.length > 0) {
      seenOcrResultsRef.current = nextProcessedKeys;
      // OCR payload теперь загружается лениво — по одному запросу на каждый
      // свежий файл. Это секвенциально, но в практике новых файлов за одну
      // итерацию единицы, так что latency не критичен.
      // Fallback: если pre-fetched ocrResultJson ещё присутствует
      // (старая версия API), используем его без лишнего запроса.
      newOcrFiles.forEach(({ file, isRerun }) => {
        const notify = (ocrResult) => {
          if (typeof onUploadComplete === "function") {
            onUploadComplete({
              file,
              employeeId: effectiveEmployeeId,
              fileDocumentType: file?.documentType,
              ocrResult,
              isRerun,
            });
          }
        };

        if (file?.ocrResultJson) {
          notify(file.ocrResultJson);
          return;
        }

        employeeService
          .getFileOcrResult(effectiveEmployeeId, file.id)
          .then((response) => {
            const ocrResult = response?.data?.ocrResult ?? null;
            notify(ocrResult);
          })
          .catch((error) => {
            // Не блокируем UI — показываем файл без автозаполнения.
            console.warn(
              "[DocumentTypeUploader] failed to fetch OCR result:",
              error?.message || error,
            );
            notify(null);
          });
      });
    }
  }, [allFiles, effectiveEmployeeId, onUploadComplete]);

  const handleUploadSubmit = async (fileList, documentType) => {
    if (!Array.isArray(fileList) || fileList.length === 0) {
      return false;
    }

    if (uploadingTypes[documentType]) {
      return false;
    }

    const currentEmployeeId = await resolveEmployeeId();
    if (!currentEmployeeId) {
      return false;
    }

    const uploadKey = fileList
      .map((file) => `${file.name}_${file.size}`)
      .join("|");
    if (uploadingRef.current.has(uploadKey)) {
      return false;
    }

    uploadingRef.current.add(uploadKey);

    const optimisticItems = fileList.map((fileObj, index) => {
      const actualFile = fileObj.originFileObj || fileObj;
      return {
        id: `local-${Date.now()}-${index}`,
        fileName: actualFile?.name || "Файл",
        documentType,
        status: "queued",
        attempts: 0,
        error: null,
      };
    });
    setUploadQueue((prev) => [...optimisticItems, ...prev]);
    setLastUploadByType((prev) => ({
      ...prev,
      [documentType]: {
        status: "queued",
        count: fileList.length,
        ts: Date.now(),
      },
    }));
    setLastUploadEvents((prev) => [
      ...fileList.map((fileObj) => ({
        id: `queued-${Date.now()}-${fileObj.uid || fileObj.name}`,
        documentType,
        fileName: fileObj?.name || fileObj?.originFileObj?.name || "Файл",
        status: "queued",
        ts: Date.now(),
      })),
      ...prev,
    ].slice(0, 10));

    const runQueueRequest = async () => {
      try {
        const preparedFiles = [];
        for (const fileObj of fileList) {
          const actualFile = fileObj.originFileObj || fileObj;
          const fileToUpload = await prepareFileForUpload({
            file: actualFile,
            documentType,
            messageApi: message,
          });
          preparedFiles.push(fileToUpload);
        }

        const queuedItems = [];
        for (let start = 0; start < preparedFiles.length; start += MAX_QUEUE_BATCH_SIZE) {
          const chunk = preparedFiles.slice(start, start + MAX_QUEUE_BATCH_SIZE);
          const formData = new FormData();
          for (const fileToUpload of chunk) {
            formData.append("files", fileToUpload);
          }
          formData.append("documentType", documentType);

          const queued = await employeeService.enqueueFiles(
            currentEmployeeId,
            formData,
          );
          if (Array.isArray(queued?.data)) {
            queuedItems.push(...queued.data);
          }
        }

        if (queuedItems.length > 0) {
          setUploadQueue((prev) => [
            ...queuedItems,
            ...prev.filter((item) => !item.id?.startsWith("local-")),
          ]);
        } else {
          await fetchUploadQueue();
        }
        await fetchOcrQueue();

        const label = getDocumentTypeLabel(documentType);
        setLastQueueNotice({
          type: "success",
          text: `В очередь: ${label} • ${fileList.length}`,
          ts: Date.now(),
        });
        return true;
      } catch (error) {
        console.error(`Error enqueue ${documentType}:`, {
          message: error?.message,
          response: error?.response?.data,
        });
        setUploadQueue((prev) =>
          prev.filter((item) => !item.id?.startsWith("local-")),
        );
        setLastQueueNotice({
          type: "error",
          text: error?.response?.data?.message || "Ошибка очереди загрузки",
          ts: Date.now(),
        });
        message.error(error?.response?.data?.message || "Ошибка очереди загрузки");
        return false;
      } finally {
        uploadingRef.current.delete(uploadKey);
      }
    };

    void runQueueRequest();
    return true;
  };

  useEffect(() => {
    if (!lastQueueNotice) return;
    const timer = setTimeout(() => setLastQueueNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [lastQueueNotice]);

  const handleDeleteFile = async (fileId) => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      await employeeService.deleteFile(effectiveEmployeeId, fileId);
      message.success("Файл удален");
      await fetchAllFiles();
      if (onFilesUpdated) {
        onFilesUpdated();
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      message.error("Ошибка удаления файла");
    }
  };

  const handleDownloadFile = async (file) => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      const downloadLink = await employeeService.getFileDownloadLink(
        effectiveEmployeeId,
        file.id,
      );
      const url = downloadLink?.data?.downloadUrl || downloadLink?.downloadUrl;

      if (url && typeof url === "string") {
        window.open(url, "_blank");
      } else {
        console.error("❌ No download URL found in response:", downloadLink);
        message.error("Ошибка при получении ссылки скачивания");
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      message.error("Ошибка скачивания файла");
    }
  };

  const handleViewFile = async (file) => {
    if (!effectiveEmployeeId) {
      return;
    }
    try {
      const viewLink = await employeeService.getFileViewLink(
        effectiveEmployeeId,
        file.id,
      );
      const url = viewLink?.data?.viewUrl || viewLink?.viewUrl;

      if (url && typeof url === "string") {
        setUiState((prev) => ({
          ...prev,
          viewingFile: {
            url,
            mimeType: file.mimeType || "application/pdf",
            fileName: file.fileName,
            fileId: file.id,
          },
          viewerVisible: true,
        }));
      } else {
        console.error("❌ No view URL found in response:", viewLink);
        message.error("Ошибка при получении ссылки просмотра");
      }
    } catch (error) {
      console.error("Error viewing file:", error);
      message.error("Ошибка просмотра файла");
    }
  };

  const handleDownloadViewingFile = async () => {
    if (!effectiveEmployeeId || !viewingFile?.fileId) {
      return;
    }
    try {
      const downloadLink = await employeeService.getFileDownloadLink(
        effectiveEmployeeId,
        viewingFile.fileId,
      );
      const url = downloadLink?.data?.downloadUrl || downloadLink?.downloadUrl;

      if (url && typeof url === "string") {
        window.open(url, "_blank");
      } else {
        message.error("Ошибка при получении ссылки скачивания");
      }
    } catch (error) {
      console.error("Error downloading preview file:", error);
      message.error("Ошибка скачивания файла");
    }
  };

  const documentTypeColumns = useMemo(
    () => splitIntoColumns(profileDocumentTypes, columnsCount),
    [columnsCount, profileDocumentTypes],
  );

  const staleOcrQueueItems = useMemo(
    () =>
      ocrQueue.filter((item) => {
        const status = String(item?.status || "").toLowerCase();
        const ageMs = Number(item?.ageMs || 0);
        return (
          (status === "waiting" || status === "delayed") &&
          Number.isFinite(ageMs) &&
          ageMs >= 120000
        );
      }),
    [ocrQueue],
  );

  const colSpan = useMemo(() => {
    if (columnsCount === 1) return { xs: 24, sm: 24, lg: 24 };
    if (columnsCount === 2) return { xs: 24, sm: 12, lg: 12 };
    return { xs: 24, sm: 12, lg: 8 };
  }, [columnsCount]);

  const documentTypeList = (
    <Row gutter={[16, 16]}>
      {documentTypeColumns.map((column) => (
        <Col
          key={`doc-column-${column.map((docType) => docType.value).join("|")}`}
          {...colSpan}
        >
          <div className="document-uploader-column">
            {column.map((docType) => (
              <DocumentTypeUploaderItem
                key={docType.value}
                docType={docType}
                filesOfType={getFilesForType(docType.value)}
                readonly={readonly}
                employeeId={effectiveEmployeeId}
                canEnsureEmployeeId={typeof ensureEmployeeId === "function"}
                uploading={uploadingTypes[docType.value]}
                messageApi={message}
                onOpenSample={handleOpenSample}
                onUploadSubmit={handleUploadSubmit}
                onViewFile={handleViewFile}
                onDownloadFile={handleDownloadFile}
                onDeleteFile={handleDeleteFile}
                onRerunOcr={onRerunOcr}
                ocrProcessingMap={ocrProcessingMap}
                compact={compact}
                queuedCount={getQueuedCountForType(docType.value)}
                uploadHint={lastUploadByType[docType.value] || null}
              />
            ))}
          </div>
        </Col>
      ))}
    </Row>
  );

  const renderQueueStatus = (item, mode = "upload") => {
    const status = String(item?.status || "").toLowerCase();
    const attempts = Number(item?.attempts || 0);
    const maxAttempts = Number(item?.maxAttempts || 0);
    const hasRetryMeta = Number.isFinite(maxAttempts) && maxAttempts > 0;
    const retryLabel = hasRetryMeta
      ? `Ретрай ${attempts}/${maxAttempts}`
      : `Повтор ${attempts}`;

    if (status === "uploading" || status === "active") {
      if (mode === "ocr" && attempts > 0) {
        return <Tag color="orange">{retryLabel}</Tag>;
      }
      return (
        <Tag color="blue">
          {mode === "ocr" ? "Распознается…" : "Загрузка…"}
        </Tag>
      );
    }
    if (status === "done" || status === "completed") {
      return <Tag color="green">Готово</Tag>;
    }
    if (status === "error" || status === "failed") {
      return <Tag color="red">Ошибка</Tag>;
    }
    if (
      mode === "ocr" &&
      (status === "waiting" || status === "delayed") &&
      attempts > 0
    ) {
      return <Tag color="orange">{retryLabel}</Tag>;
    }
    if (attempts > 0) {
      return <Tag color="orange">{retryLabel}</Tag>;
    }
    return <Tag>В очереди</Tag>;
  };

  if (viewerMode === "inline") {
    const closeViewer = () =>
      setUiState((prev) => ({ ...prev, viewingFile: null, viewerVisible: false }));

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <style>{DOCUMENT_TYPE_UPLOADER_STYLES}</style>

        {/* Список документов — скрываем через display:none чтобы сохранить скролл */}
        <div style={{ overflowY: "auto", height: "100%", display: viewingFile ? "none" : "block" }}>
          {documentTypeList}
        </div>

        {/* Viewer — занимает всю высоту когда открыт */}
        {viewingFile ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <EmployeeDocumentPreviewPane
              viewingFile={viewingFile}
              fill
              onBack={closeViewer}
              onDownload={handleDownloadViewingFile}
            />
          </div>
        ) : null}

        <DocumentTypeUploaderSampleModal
          visible={sampleModalVisible}
          docType={selectedSampleDocType}
          onClose={() =>
            setUiState((prev) => ({ ...prev, sampleModalVisible: false }))
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0" }}>
      <style>{DOCUMENT_TYPE_UPLOADER_STYLES}</style>

      {showInfoBanner ? (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            backgroundColor: "#f0f5ff",
            borderRadius: 4,
            fontSize: "12px",
            color: "#1890ff",
            border: "1px solid #b3d8ff",
          }}
        >
          ℹ️ Нажмите «Загрузить» напротив нужного типа документа. Далее в модалке
          выберите или перетащите файлы (поддерживаемые форматы:{" "}
          {SUPPORTED_FORMATS})
          {loadingDocumentTypes && (
            <span style={{ marginLeft: 8 }}>
              <Spin size="small" />
            </span>
          )}
        </div>
      ) : null}

      {lastQueueNotice && (
        <Alert
          type={lastQueueNotice.type}
          message={lastQueueNotice.text}
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}

      {lastUploadEvents.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            border: "1px dashed #d9d9d9",
            borderRadius: 8,
            padding: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            История загрузки
          </div>
          <List
            size="small"
            dataSource={lastUploadEvents}
            renderItem={(item) => (
              <List.Item>
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <span>
                    {getDocumentTypeLabel(item.documentType)} • {item.fileName}
                  </span>
                  <Tag color={item.status === "done" ? "green" : "blue"}>
                    {item.status === "done" ? "Загружен" : "В очереди"}
                  </Tag>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {uploadQueue.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #f0f0f0",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Очередь загрузки
          </div>
          <List
            size="small"
            dataSource={uploadQueue}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <span>{item.fileName || "Файл"}</span>
                    {renderQueueStatus(item)}
                  </Space>
                  <Space style={{ color: "#8c8c8c", fontSize: 12 }}>
                    <span>{getDocumentTypeLabel(item.documentType)}</span>
                    {item.error && (
                      <>
                        <span>•</span>
                        <span style={{ color: "#cf1322" }}>{item.error}</span>
                      </>
                    )}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {ocrQueue.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            border: "1px solid #f0f0f0",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Очередь OCR</div>
          {staleOcrQueueItems.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 8 }}
              message={`OCR очередь долго в ожидании (${staleOcrQueueItems.length}). Проверьте worker/Redis.`}
            />
          )}
          <List
            size="small"
            dataSource={ocrQueue}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <span>
                      {item.fileName ||
                        getDocumentTypeLabel(item.documentType) ||
                        item.fileId ||
                        "Документ"}
                    </span>
                    {renderQueueStatus(item, "ocr")}
                  </Space>
                  <Space style={{ color: "#8c8c8c", fontSize: 12 }}>
                    <span>{getDocumentTypeLabel(item.documentType)}</span>
                    {Number(item?.maxAttempts) > 0 && (
                      <>
                        <span>•</span>
                        <span>
                          попытка {Number(item?.attempts || 0)}/
                          {Number(item?.maxAttempts)}
                        </span>
                      </>
                    )}
                    {item.error && (
                      <>
                        <span>•</span>
                        <span style={{ color: "#cf1322" }}>{item.error}</span>
                      </>
                    )}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {documentTypeList}

      {viewerMode === "modal" && viewingFile && (
        <FileViewer
          visible={viewerVisible}
          fileUrl={viewingFile.url}
          fileName={viewingFile.fileName}
          mimeType={viewingFile.mimeType}
          onClose={() =>
            setUiState((prev) => ({ ...prev, viewerVisible: false }))
          }
        />
      )}

      <DocumentTypeUploaderSampleModal
        visible={sampleModalVisible}
        docType={selectedSampleDocType}
        onClose={() =>
          setUiState((prev) => ({ ...prev, sampleModalVisible: false }))
        }
      />
    </div>
  );
};

export default DocumentTypeUploader;
