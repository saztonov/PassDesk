export const MAX_EXCEL_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_EXCEL_IMPORT_ROWS = 20000;

const EXCEL_ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls"]);
const EXCEL_ALLOWED_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

export const XLSX_READ_SAFE_OPTIONS = Object.freeze({
  dense: true,
  cellFormula: false,
  cellHTML: false,
  cellStyles: false,
  bookVBA: false,
  WTF: false,
});

const getExtension = (fileName = "") => {
  const normalized = String(fileName || "").trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0) {
    return "";
  }
  return normalized.slice(dotIndex);
};

export const validateExcelImportFile = (
  file,
  { maxBytes = MAX_EXCEL_IMPORT_BYTES } = {},
) => {
  if (!file || typeof file.size !== "number") {
    throw new Error("Файл не выбран");
  }

  if (file.size <= 0) {
    throw new Error("Файл пустой");
  }

  if (file.size > maxBytes) {
    throw new Error(
      `Файл слишком большой. Максимальный размер: ${Math.floor(maxBytes / 1024 / 1024)} МБ`,
    );
  }

  const extension = getExtension(file.name);
  const mimeType = String(file.type || "").trim().toLowerCase();
  const isAllowedByExtension = EXCEL_ALLOWED_EXTENSIONS.has(extension);
  const isAllowedByMimeType =
    !mimeType || EXCEL_ALLOWED_MIME_TYPES.has(mimeType);

  if (!isAllowedByExtension || !isAllowedByMimeType) {
    throw new Error("Поддерживаются только файлы Excel (.xlsx, .xls)");
  }
};

export const ensureExcelRowLimit = (
  rows = [],
  { maxRows = MAX_EXCEL_IMPORT_ROWS } = {},
) => {
  if (Array.isArray(rows) && rows.length > maxRows) {
    throw new Error(
      `Слишком много строк в Excel (${rows.length}). Допустимо не более ${maxRows}`,
    );
  }
};
