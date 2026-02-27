/**
 * Все MIME типы для валидации
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/**
 * Расширения файлов для фильтра
 */
export const ALLOWED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.pdf,.xls,.xlsx,.doc,.docx";

/**
 * Описание поддерживаемых типов файлов для показа пользователю
 */
export const SUPPORTED_FORMATS = "JPG, PNG, WEBP, PDF, XLS, XLSX, DOC, DOCX";
