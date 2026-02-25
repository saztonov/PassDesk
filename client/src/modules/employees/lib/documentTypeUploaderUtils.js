export const DEFAULT_DOCUMENT_TYPES = [
  { value: "passport", label: "Паспорт" },
  { value: "passport_translation", label: "Перевод паспорта" },
  { value: "inn_document", label: "ИНН" },
  { value: "bank_details", label: "Реквизиты счета" },
  { value: "consent", label: "Согласие на перс.дан. Подрядчик" },
  { value: "biometric_consent", label: "Согласие на перс.дан. Генподряд" },
  {
    value: "biometric_consent_developer",
    label: "Согласие на перс.дан. Застройщ",
  },
  { value: "diploma", label: "Диплом" },
  { value: "snils_card", label: "СНИЛС" },
  { value: "patent_front", label: "Патент (лиц.)" },
  { value: "patent_back", label: "Патент (спин.)" },
  { value: "visa", label: "Виза" },
  { value: "arrival_notice", label: "Уведомление о прибытии" },
  { value: "patent_payment_receipt", label: "Чек оплаты патента" },
];

export const splitIntoColumns = (items, columnsCount = 3) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const chunkSize = Math.max(1, Math.ceil(items.length / columnsCount));
  const columns = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    columns.push(items.slice(index, index + chunkSize));
  }

  return columns;
};

const getSampleMimeType = (docType) =>
  docType?.sampleMimeType || docType?.sample_mime_type || "";

export const getSampleUrl = (docType) =>
  docType?.sampleUrl || docType?.sample_url || "";

export const isImageSample = (docType) => {
  const sampleMimeType = getSampleMimeType(docType).toLowerCase();
  const sampleUrl = getSampleUrl(docType);
  return (
    sampleMimeType.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(sampleUrl)
  );
};

export const isPdfSample = (docType) => {
  const sampleMimeType = getSampleMimeType(docType).toLowerCase();
  const sampleUrl = getSampleUrl(docType);
  return sampleMimeType.includes("pdf") || /\.pdf(\?.*)?$/i.test(sampleUrl);
};

export const normalizeDocumentTypes = (types) => {
  if (!Array.isArray(types) || types.length === 0) {
    return DEFAULT_DOCUMENT_TYPES;
  }

  const normalized = types
    .map((item) => ({
      value: item.value || item.code || "",
      label: item.label || item.name || item.code || "Без названия",
      description: item.description || "",
      sampleUrl: item.sampleUrl || item.sample_url || "",
      sampleMimeType: item.sampleMimeType || item.sample_mime_type || "",
      sampleHighlightedFields: Array.isArray(item.sampleHighlightedFields)
        ? item.sampleHighlightedFields
        : Array.isArray(item.sample_highlighted_fields)
          ? item.sample_highlighted_fields
          : [],
      sortOrder: Number.isFinite(item.sortOrder)
        ? item.sortOrder
        : Number.isFinite(item.sort_order)
          ? item.sort_order
          : 0,
    }))
    .filter((item) => item.value);

  return normalized.length > 0 ? normalized : DEFAULT_DOCUMENT_TYPES;
};

export const DOCUMENT_TYPE_UPLOADER_STYLES = `
  .document-uploader-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .document-uploader-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-radius: 4px;
    background: #fafafa;
    border: 1px solid #f0f0f0;
  }
  .document-uploader-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .document-uploader-label {
    min-width: 140px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 0 0 auto;
  }
  .document-uploader-info-button {
    flex-shrink: 0;
    color: #1677ff;
  }
  .document-uploader-button {
    flex: 0 0 auto;
    width: 90px;
  }
  .document-uploader-count {
    font-size: 12px;
    color: #8c8c8c;
    min-width: 50px;
    text-align: right;
    flex: 0 0 auto;
  }
  .document-uploader-files {
    padding-left: 4px;
    margin-top: 4px;
    border-top: 1px solid #e8e8e8;
    padding-top: 6px;
  }
  .document-uploader-files .ant-list {
    padding: 0;
    background: transparent;
  }
  .document-uploader-files .ant-list-item {
    padding: 4px 0;
    border: none;
  }
  .document-sample-preview {
    max-height: 60vh;
    overflow: auto;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    padding: 8px;
    background: #fff;
  }
  .document-sample-preview img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0 auto;
  }
`;
