import { useState, useEffect, useRef, useCallback } from "react";
import { Button, Image, App, Space, Popconfirm, Tooltip, Spin } from "antd";
import {
  UploadOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileImageOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import { employeeService } from "@/services/employeeService";
import { DocumentScannerModal as DocumentCamera } from "@/features/document-scanner";
import {
  ALLOWED_MIME_TYPES,
  SUPPORTED_FORMATS,
} from "@/shared/constants/fileTypes.js";

/**
 * Компонент для загрузки типизированных документов сотрудника
 * Используется для мобильной версии формы
 *
 * @param {string} employeeId - ID сотрудника
 * @param {string} documentType - Тип документа (passport, passport_translation, consent, biometric_consent, biometric_consent_developer, bank_details, snils_card, patent_front, patent_back, visa, diploma, arrival_notice, patent_payment_receipt)
 * @param {string} label - Название поля для отображения
 * @param {boolean} readonly - Режим только для чтения
 * @param {boolean} multiple - Разрешить загрузку нескольких файлов
 * @param {Function} ensureEmployeeId - Функция создания черновика для получения employeeId
 */
const EmployeeDocumentUpload = ({
  employeeId,
  documentType,
  label,
  readonly = false,
  multiple = true,
  ensureEmployeeId,
  onUploadComplete,
  hideIfEmpty = false,
}) => {
  const { message } = App.useApp();
  const [state, setState] = useState({
    files: [],
    loading: false,
    uploading: false,
    previewImage: null,
    previewVisible: false,
    cameraVisible: false,
    resolvedEmployeeId: null,
  });
  const {
    files,
    loading,
    uploading,
    previewImage,
    previewVisible,
    cameraVisible,
    resolvedEmployeeId,
  } = state;
  const effectiveEmployeeId = employeeId || resolvedEmployeeId;
  const cameraMode = documentType === "passport" ? "passport" : "document";

  // Ссылка на скрытый инпут для системной камеры (резервный вариант)
  const nativeCameraInputRef = useRef(null);

  // Ссылка на скрытый инпут для выбора файлов
  const fileInputRef = useRef(null);

  const resolveEmployeeId = async () => {
    if (effectiveEmployeeId) {
      return effectiveEmployeeId;
    }
    if (!ensureEmployeeId) {
      message.error("Сначала сохраните черновик сотрудника");
      return null;
    }
    try {
      const newEmployeeId = await ensureEmployeeId();
      if (newEmployeeId) {
        setState((prev) => ({ ...prev, resolvedEmployeeId: newEmployeeId }));
        return newEmployeeId;
      }
      message.error("Не удалось создать черновик сотрудника");
      return null;
    } catch (error) {
      message.error("Не удалось создать черновик сотрудника");
      return null;
    }
  };

  // Загрузка файлов с сервера
  const fetchFiles = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      if (!effectiveEmployeeId) {
        setState((prev) => ({ ...prev, files: [] }));
        return;
      }

      const response = await employeeService.getFiles(effectiveEmployeeId);

      // Фильтруем файлы по типу документа
      const filteredFiles =
        response.data?.filter((file) => {
          const typeValue = file.documentType || file.document_type;
          return typeValue === documentType;
        }) || [];

      setState((prev) => ({ ...prev, files: filteredFiles }));
    } catch (error) {
      console.error("Error loading files:", error);
      message.error("Ошибка загрузки файлов");
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [documentType, effectiveEmployeeId, message]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Загрузка файла (универсальная функция)
  const uploadFile = async (file) => {
    const currentEmployeeId = await resolveEmployeeId();
    if (!currentEmployeeId) {
      return;
    }

    // Проверка типа файла: сначала MIME, затем fallback по расширению
    // (некоторые Android-камеры возвращают пустой/нестандартный MIME).
    const mimeType = String(file?.type || "").toLowerCase();
    const ext = String(file?.name || "")
      .toLowerCase()
      .split(".")
      .pop();
    const allowedByExtension = new Set([
      "jpg",
      "jpeg",
      "png",
      "webp",
      "pdf",
      "xls",
      "xlsx",
      "doc",
      "docx",
    ]);
    const isSupportedType =
      ALLOWED_MIME_TYPES.includes(mimeType) ||
      (ext && allowedByExtension.has(ext));

    if (!isSupportedType) {
      message.error(
        `❌ ${file.name}: неподдерживаемый тип файла\n` +
          `✅ Поддерживаются: ${SUPPORTED_FORMATS}`,
      );
      return;
    }

    // Проверка размера файла (макс. 100 МБ)
    const fileSizeMB = file.size / 1024 / 1024;
    if (fileSizeMB > 100) {
      message.error(
        `❌ ${file.name}: размер файла ${fileSizeMB.toFixed(2)}MB превышает максимум 100MB`,
      );
      return;
    }

    const formData = new FormData();
    formData.append("files", file);
    formData.append("documentType", documentType);

    setState((prev) => ({ ...prev, uploading: true }));
    try {
      const uploadResult = await employeeService.uploadFiles(
        currentEmployeeId,
        formData,
      );
      message.success("Файл успешно загружен");
      const uploadedFiles = Array.isArray(uploadResult?.data)
        ? uploadResult.data
        : [];
      if (typeof onUploadComplete === "function" && uploadedFiles.length > 0) {
        for (const uploadedFile of uploadedFiles) {
          await onUploadComplete({
            file: uploadedFile,
            employeeId: currentEmployeeId,
            fileDocumentType: documentType,
          });
        }
      }
      fetchFiles();
    } catch (error) {
      console.error("Error uploading file:", error);
      message.error(error.response?.data?.message || "Ошибка загрузки файла");
    } finally {
      setState((prev) => ({ ...prev, uploading: false }));
    }
  };

  // Обработка захвата с системной камеры (Fallback)
  const handleNativeCameraCapture = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const mimeType = String(file.type || "").toLowerCase();
      const ext = String(file?.name || "")
        .toLowerCase()
        .split(".")
        .pop();
      const isSupportedMime =
        ALLOWED_MIME_TYPES.includes(mimeType) ||
        ["jpg", "jpeg", "png", "webp"].includes(ext);

      if (!isSupportedMime) {
        message.error(
          `Формат фото не поддерживается (${mimeType || "unknown"}). Используйте JPG/PNG/WEBP или загрузите через кнопку "Файлы".`,
        );
        e.target.value = "";
        return;
      }

      await uploadFile(file);
    }
    // Очищаем инпут, чтобы можно было снять то же самое фото снова
    e.target.value = "";
  };

  // Обработка захвата в модуле scanic
  const handleCameraCapture = async (blob) => {
    const file = new File([blob], `document-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    setState((prev) => ({ ...prev, cameraVisible: false }));
    await uploadFile(file);
  };

  // Обработка выбора файлов из файлового менеджера
  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Если multiple не разрешен, загружаем только первый файл
      const filesToUpload = multiple ? Array.from(files) : [files[0]];

      for (const file of filesToUpload) {
        await uploadFile(file);
      }
    }
    // Очищаем инпут для следующей загрузки
    e.target.value = "";
  };

  // Открыть файловый менеджер
  const handleOpenFileManager = () => {
    if (!effectiveEmployeeId && !ensureEmployeeId) {
      message.error("Сначала сохраните черновик сотрудника");
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Запуск системной камеры
  const handleStartCamera = () => {
    if (!effectiveEmployeeId && !ensureEmployeeId) {
      message.error("Сначала сохраните черновик сотрудника");
      return;
    }

    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const maxTouchPoints =
      typeof navigator !== "undefined" ? Number(navigator.maxTouchPoints || 0) : 0;

    const isMobileUserAgent =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent,
      );
    const isIosDevice =
      /iPhone|iPad|iPod/i.test(userAgent) ||
      (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);

    // На Android предпочитаем нативную камеру. Для iOS используем встроенный
    // сканер, потому что нативный capture часто отдает HEIC/HEIF.
    if (isMobileUserAgent && !isIosDevice) {
      nativeCameraInputRef.current?.click();
      return;
    }

    const supportsScanner =
      typeof window !== "undefined" &&
      Boolean(window.isSecureContext) &&
      Boolean(navigator.mediaDevices?.getUserMedia);

    if (supportsScanner) {
      setState((prev) => ({ ...prev, cameraVisible: true }));
      return;
    }

    nativeCameraInputRef.current?.click();
  };

  // Удаление файла
  const handleDelete = async (fileId) => {
    try {
      if (!effectiveEmployeeId) {
        return;
      }
      await employeeService.deleteFile(effectiveEmployeeId, fileId);
      message.success("Файл удален");
      fetchFiles();
    } catch (error) {
      console.error("Error deleting file:", error);
      message.error("Ошибка удаления файла");
    }
  };

  // Просмотр файла
  const handleView = async (file) => {
    try {
      if (!effectiveEmployeeId) {
        return;
      }
      const response = await employeeService.getFileViewLink(
        effectiveEmployeeId,
        file.id,
      );
      if (response.data.viewUrl) {
        if (file.mimeType.startsWith("image/")) {
          setState((prev) => ({
            ...prev,
            previewImage: response.data.viewUrl,
            previewVisible: true,
          }));
        } else {
          window.open(response.data.viewUrl, "_blank");
        }
      }
    } catch (error) {
      console.error("Error getting view link:", error);
      message.error("Ошибка получения ссылки для просмотра");
    }
  };

  if (readonly && hideIfEmpty && !loading && files.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 14,
          marginBottom: 8,
          color: "rgba(0, 0, 0, 0.88)",
        }}
      >
        {label}
      </div>

      {loading ? (
        <Spin />
      ) : (
        <>
          {/* Отображение загруженных файлов */}
          {files.length > 0 && (
            <Space
              direction="vertical"
              size={8}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {files.map((file) => (
                <div
                  key={file.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: 8,
                    background: "#f5f5f5",
                    borderRadius: 4,
                    width: "100%",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <FileImageOutlined
                      style={{ fontSize: 20, color: "#52c41a" }}
                    />
                    <span
                      style={{
                        display: "block",
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.fileName}
                    </span>
                  </div>

                  <Space size={4} style={{ flexShrink: 0 }}>
                    <Tooltip title="Просмотр">
                      <Button
                        icon={<EyeOutlined />}
                        size="small"
                        onClick={() => handleView(file)}
                      />
                    </Tooltip>
                    {!readonly && (
                      <Popconfirm
                        title="Удалить файл?"
                        onConfirm={() => handleDelete(file.id)}
                        okText="Удалить"
                        cancelText="Отмена"
                      >
                        <Button icon={<DeleteOutlined />} size="small" danger />
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              ))}
            </Space>
          )}

          {/* Кнопки загрузки */}
          {!readonly && ((!multiple && files.length < 1) || multiple) && (
            <>
              <Space style={{ width: "100%" }}>
                {/* Кнопка фотографирования */}
                <Button
                  icon={<CameraOutlined />}
                  type="primary"
                  size="middle"
                  onClick={handleStartCamera}
                  disabled={uploading}
                >
                  Фото
                </Button>

                {/* Скрытый инпут для системной камеры (Fallback) */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  ref={nativeCameraInputRef}
                  onChange={handleNativeCameraCapture}
                />

                {/* Кнопка загрузки файла */}
                <Button
                  icon={<UploadOutlined />}
                  loading={uploading}
                  size="middle"
                  onClick={handleOpenFileManager}
                  disabled={uploading}
                >
                  {uploading ? "Загрузка..." : "Файлы"}
                </Button>

                {/* Скрытый инпут для выбора файлов */}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.xls,.xlsx,.doc,.docx"
                  multiple={multiple}
                  style={{ display: "none" }}
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                />
              </Space>
            </>
          )}

          {!readonly && (
            <div style={{ color: "#1890ff", fontSize: "12px", marginTop: 8 }}>
              ✅ Поддерживаемые форматы: {SUPPORTED_FORMATS} (макс. 100 МБ)
            </div>
          )}
        </>
      )}

      {/* Модальное окно предпросмотра */}
      <Image
        style={{ display: "none" }}
        preview={{
          visible: previewVisible,
          src: previewImage,
          onVisibleChange: (visible) =>
            setState((prev) => ({ ...prev, previewVisible: visible })),
        }}
      />

      <DocumentCamera
        visible={cameraVisible}
        mode={cameraMode}
        onCapture={handleCameraCapture}
        onCancel={() => setState((prev) => ({ ...prev, cameraVisible: false }))}
      />
    </div>
  );
};

export default EmployeeDocumentUpload;
