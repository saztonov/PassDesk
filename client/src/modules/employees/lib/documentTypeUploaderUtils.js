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
    justify-content: space-between;
    gap: 12px;
  }
  .document-uploader-title-group {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    width: 100%;
  }
  .document-uploader-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }
  .document-uploader-label {
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    white-space: normal;
    line-height: 1.35;
    flex: 1 1 auto;
  }
  .document-uploader-info-button {
    flex-shrink: 0;
    color: #1677ff;
  }
  .document-uploader-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .document-uploader-button {
    flex: 0 0 auto;
    width: 90px;
  }
  .document-uploader-count {
    font-size: 12px;
    color: #8c8c8c;
    min-width: 44px;
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
  .document-uploader-item-compact {
    padding: 10px 0;
    background: transparent;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    border-radius: 0;
    gap: 8px;
  }
  .document-uploader-item-compact:last-child {
    border-bottom: none;
  }
  .document-uploader-item-compact .document-uploader-header {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .document-uploader-item-compact .document-uploader-title-group {
    width: 100%;
  }
  .document-uploader-item-compact .document-uploader-label {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
  }
  .document-uploader-item-compact .document-uploader-meta {
    align-self: flex-start;
  }
  .document-uploader-item-compact .document-uploader-actions {
    width: 100%;
  }
  .document-uploader-item-compact .document-uploader-button {
    width: 100%;
    min-width: 0;
    padding-inline: 10px;
  }
  .document-uploader-item-compact .document-uploader-count {
    min-width: 0;
    color: #595959;
  }
  .document-uploader-item-compact .document-uploader-files {
    padding-left: 0;
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }
  .document-uploader-item-compact .document-uploader-files .ant-list-item {
    padding: 6px 0 0;
  }
  .document-uploader-file-item-compact .ant-list-item-meta {
    margin-bottom: 0;
  }
  .document-uploader-file-item-compact .ant-list-item-meta-title {
    margin-bottom: 0;
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
  @media (max-width: 1200px) {
    .document-uploader-header {
      align-items: flex-start;
    }
    .document-uploader-actions {
      align-self: stretch;
    }
    .document-uploader-item-compact .document-uploader-actions {
      width: 100%;
      align-self: stretch;
    }
  }
`;
