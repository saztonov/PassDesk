import axios from "axios";
import archiver from "archiver";
import * as XLSX from "xlsx";
import { QueryTypes } from "sequelize";
import path from "path";
import {
  sequelize,
  CounterpartySubcounterpartyMapping,
  Setting,
} from "../models/index.js";
import storageProvider from "../config/storage.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  decryptField,
  ENCRYPTED_EMPLOYEE_FIELDS,
  hashForSearch,
} from "../services/encryptionService.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_EXPORT_ROWS = 10000;
const EXPIRY_SOON_DAYS = 30;

const DOCUMENT_STATUSES = new Set(["uploaded", "not_uploaded", "expiring"]);

const STATUS_LABELS = {
  uploaded: "Загружен",
  not_uploaded: "Не загружен",
  expiring: "Срок истекает",
};

const PROFILE_CODES = {
  EXTERNAL: "external",
  DEFAULT_RU: "default_ru",
  DEFAULT_EAEU: "default_eaeu",
  DEFAULT_MIGRANT: "default_migrant",
};

const LEGACY_PROFILE_CODES = {
  DEFAULT_RU_BY: "default_ru_by",
  DEFAULT_FOREIGN: "default_foreign",
};

const BASE_CONSENTS = [
  "consent",
  "biometric_consent",
  "biometric_consent_developer",
];
const REQUIRED_PROFILE_CODES = {
  [PROFILE_CODES.EXTERNAL]: [],
  [PROFILE_CODES.DEFAULT_RU]: [],
  [PROFILE_CODES.DEFAULT_EAEU]: [],
  [PROFILE_CODES.DEFAULT_MIGRANT]: ["kig"],
};

const DEFAULT_DOCUMENT_PROFILES = {
  [PROFILE_CODES.EXTERNAL]: [...BASE_CONSENTS],
  [PROFILE_CODES.DEFAULT_RU]: [
    "passport",
    "bank_details",
    ...BASE_CONSENTS,
    "diploma",
    "snils_card",
  ],
  [PROFILE_CODES.DEFAULT_EAEU]: [
    "passport",
    "bank_details",
    ...BASE_CONSENTS,
    "diploma",
    "snils_card",
  ],
  [PROFILE_CODES.DEFAULT_MIGRANT]: [
    "passport",
    "passport_translation",
    "kig",
    "patent_front",
    "patent_back",
    "bank_details",
    ...BASE_CONSENTS,
    "snils_card",
    "visa",
    "arrival_notice",
    "patent_payment_receipt",
  ],
};

const toUniqueCodes = (values = []) => {
  const unique = [];
  const seen = new Set();

  (Array.isArray(values) ? values : []).forEach((item) => {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(normalized);
  });

  return unique;
};

const normalizeDocumentProfilesConfig = (rawConfig) => {
  const input =
    rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
      ? rawConfig
      : {};

  const getInputCodes = (profileCode) => {
    if (Array.isArray(input[profileCode])) {
      return input[profileCode];
    }

    if (
      profileCode === PROFILE_CODES.DEFAULT_RU ||
      profileCode === PROFILE_CODES.DEFAULT_EAEU
    ) {
      return input[LEGACY_PROFILE_CODES.DEFAULT_RU_BY];
    }

    if (profileCode === PROFILE_CODES.DEFAULT_MIGRANT) {
      return input[LEGACY_PROFILE_CODES.DEFAULT_FOREIGN];
    }

    return input[profileCode];
  };

  const hasExplicitProfile = (profileCode) => {
    if (Array.isArray(input[profileCode])) {
      return true;
    }

    if (
      profileCode === PROFILE_CODES.DEFAULT_RU ||
      profileCode === PROFILE_CODES.DEFAULT_EAEU
    ) {
      return Array.isArray(input[LEGACY_PROFILE_CODES.DEFAULT_RU_BY]);
    }

    if (profileCode === PROFILE_CODES.DEFAULT_MIGRANT) {
      return Array.isArray(input[LEGACY_PROFILE_CODES.DEFAULT_FOREIGN]);
    }

    return false;
  };

  return Object.values(PROFILE_CODES).reduce((acc, profileCode) => {
    const ensureRequiredByProfile = (codes = []) => {
      const requiredCodes = REQUIRED_PROFILE_CODES[profileCode] || [];
      if (!requiredCodes.length) {
        return toUniqueCodes(codes);
      }
      const result = [...toUniqueCodes(codes)];
      requiredCodes.forEach((code) => {
        if (!result.includes(code)) {
          result.push(code);
        }
      });
      return result;
    };

    const inputCodes = ensureRequiredByProfile(getInputCodes(profileCode));
    const fallbackCodes = ensureRequiredByProfile(
      DEFAULT_DOCUMENT_PROFILES[profileCode] || [],
    );
    acc[profileCode] = hasExplicitProfile(profileCode)
      ? inputCodes
      : inputCodes.length > 0
        ? inputCodes
        : fallbackCodes;
    return acc;
  }, {});
};

const loadDocumentProfilesConfig = async () => {
  try {
    const rawSetting = await Setting.getSetting("employee_document_profiles");
    if (!rawSetting) {
      return normalizeDocumentProfilesConfig(null);
    }
    const parsed = JSON.parse(rawSetting);
    return normalizeDocumentProfilesConfig(parsed);
  } catch (error) {
    console.warn(
      "Failed to load employee_document_profiles setting, using defaults:",
      error.message,
    );
    return normalizeDocumentProfilesConfig(null);
  }
};

let hasDocumentTypeRequiredColumnCache = null;

const sanitizeZipSegment = (value) =>
  String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/\.\.+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim() || "Без_названия";

const buildSafeZipEntryName = (...segments) => {
  const safeSegments = segments.map((segment) => sanitizeZipSegment(segment));
  const normalized = path.posix.normalize(safeSegments.join("/"));

  if (
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized === ".."
  ) {
    throw new AppError("Небезопасное имя файла в архиве", 400);
  }

  return normalized.replace(/^\/+/, "");
};

const normalizePositiveInt = (value, fallback) => {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().split("T")[0];
};

const normalizeSearch = (value) => {
  if (!value) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeIdList = (value) => {
  if (!value) return [];

  const raw = Array.isArray(value) ? value : String(value).split(",");
  return [
    ...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)),
  ];
};

const resolveEncryptedValue = (plainValue, encryptedPayload, keyVersion) => {
  if (plainValue !== null && plainValue !== undefined && plainValue !== "") {
    return plainValue;
  }
  if (!encryptedPayload || !keyVersion) {
    return plainValue ?? null;
  }

  try {
    return decryptField(encryptedPayload, keyVersion);
  } catch {
    return plainValue ?? null;
  }
};

const buildEmployeeFullName = (lastName, firstName, middleName) =>
  [lastName, firstName, middleName].filter(Boolean).join(" ").trim() || null;

const resolveSeriesNumber = (row) => {
  const passportNumber = resolveEncryptedValue(
    null,
    row.passport_number_enc,
    row.passport_number_key_version,
  );
  const kig = resolveEncryptedValue(null, row.kig_enc, row.kig_key_version);
  const patentNumber = resolveEncryptedValue(
    null,
    row.patent_number_enc,
    row.patent_number_key_version,
  );

  if (row.document_type_code === "passport") {
    return passportNumber || null;
  }

  if (
    row.document_type_code === "patent_front" ||
    row.document_type_code === "patent_back" ||
    row.document_type_code === "patent_payment_receipt"
  ) {
    return patentNumber || null;
  }

  if (row.document_type_code === "kig") {
    return kig || null;
  }

  if (row.document_type_code === "visa") {
    return row.blank_number || null;
  }

  return null;
};

const getAllowedCounterpartyIds = async (user) => {
  if (user.role === "admin" || user.role === "manager") {
    return null;
  }

  if (user.role !== "user") {
    throw new AppError("Недостаточно прав", 403);
  }

  const defaultCounterpartyId = await Setting.getSetting(
    "default_counterparty_id",
  );
  if (!defaultCounterpartyId) {
    return [user.counterpartyId];
  }

  if (user.counterpartyId === defaultCounterpartyId) {
    return [user.counterpartyId];
  }

  const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
    where: { parentCounterpartyId: user.counterpartyId },
    attributes: ["childCounterpartyId"],
  });

  return [
    user.counterpartyId,
    ...subcontractors.map((item) => item.childCounterpartyId),
  ];
};

const hasDocumentTypeRequiredColumn = async () => {
  if (hasDocumentTypeRequiredColumnCache !== null) {
    return hasDocumentTypeRequiredColumnCache;
  }

  const rows = await sequelize.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'document_types'
          AND column_name = 'is_required'
      ) AS exists
    `,
    { type: QueryTypes.SELECT },
  );

  hasDocumentTypeRequiredColumnCache = Boolean(rows?.[0]?.exists);
  return hasDocumentTypeRequiredColumnCache;
};

const buildDocumentCte = async ({ user, filters }) => {
  const replacements = {
    expiringDays: EXPIRY_SOON_DAYS,
  };
  const [hasRequiredColumn, documentProfiles, defaultCounterpartyId] =
    await Promise.all([
      hasDocumentTypeRequiredColumn(),
      loadDocumentProfilesConfig(),
      Setting.getSetting("default_counterparty_id"),
    ]);

  replacements.profileExternalDocTypes =
    documentProfiles[PROFILE_CODES.EXTERNAL];
  replacements.profileDefaultRuDocTypes =
    documentProfiles[PROFILE_CODES.DEFAULT_RU];
  replacements.profileDefaultEaeuDocTypes =
    documentProfiles[PROFILE_CODES.DEFAULT_EAEU];
  replacements.profileDefaultMigrantDocTypes =
    documentProfiles[PROFILE_CODES.DEFAULT_MIGRANT];

  const hasDefaultCounterparty = Boolean(defaultCounterpartyId);
  if (hasDefaultCounterparty) {
    replacements.defaultCounterpartyId = defaultCounterpartyId;
  }

  const allowedCounterpartyIds = await getAllowedCounterpartyIds(user);
  if (allowedCounterpartyIds && allowedCounterpartyIds.length === 0) {
    return { cte: "", replacements, statusWhere: [], empty: true };
  }

  const employeeWhere = ["e.is_deleted = FALSE"];
  if (allowedCounterpartyIds) {
    employeeWhere.push("ecm.counterparty_id IN (:allowedCounterpartyIds)");
    replacements.allowedCounterpartyIds = allowedCounterpartyIds;
  }

  if (filters.counterpartyId) {
    if (
      allowedCounterpartyIds &&
      !allowedCounterpartyIds.includes(filters.counterpartyId)
    ) {
      throw new AppError("Нет доступа к выбранному контрагенту", 403);
    }
    employeeWhere.push("ecm.counterparty_id = :counterpartyId");
    replacements.counterpartyId = filters.counterpartyId;
  }

  if (filters.employeeSearch) {
    let employeeSearchLastNameHash = null;
    try {
      employeeSearchLastNameHash = hashForSearch(
        ENCRYPTED_EMPLOYEE_FIELDS.LAST_NAME,
        filters.employeeSearch,
      );
    } catch {
      employeeSearchLastNameHash = null;
    }

    employeeWhere.push(`(
      e.first_name ILIKE :employeeSearch
      OR e.middle_name ILIKE :employeeSearch
      OR CONCAT_WS(' ', e.first_name, e.middle_name) ILIKE :employeeSearch
      OR (:employeeSearchLastNameHash IS NOT NULL AND e.last_name_hash = :employeeSearchLastNameHash)
    )`);
    replacements.employeeSearchLastNameHash = employeeSearchLastNameHash;

    replacements.employeeSearch = `%${filters.employeeSearch}%`;
  }

  if (Array.isArray(filters.employeeIds) && filters.employeeIds.length > 0) {
    employeeWhere.push("e.id IN (:employeeIds)");
    replacements.employeeIds = filters.employeeIds;
  }

  const documentWhere = ["dt.is_active = TRUE"];
  if (filters.documentType) {
    documentWhere.push("dt.code = :documentType");
    replacements.documentType = filters.documentType;
  }

  const statusWhere = [];
  if (filters.status) {
    statusWhere.push("bd.doc_status = :status");
    replacements.status = filters.status;
  }

  const expiryDateSql = `CASE
      WHEN dt.code = 'passport' THEN fe.passport_expiry_date::date
      WHEN dt.code = 'kig' THEN fe.kig_end_date::date
      WHEN dt.code IN ('patent_front', 'patent_back', 'patent_payment_receipt')
        AND fe.patent_issue_date IS NOT NULL
      THEN (fe.patent_issue_date + INTERVAL '1 year')::date
      ELSE NULL
    END`;

  const profileConditionSql = hasDefaultCounterparty
    ? `(
        CASE
          WHEN fe.counterparty_id::text <> :defaultCounterpartyId::text THEN dt.code IN (:profileExternalDocTypes)
          WHEN fe.is_russian_citizenship = TRUE THEN dt.code IN (:profileDefaultRuDocTypes)
          WHEN fe.is_eaeu_citizenship = TRUE THEN dt.code IN (:profileDefaultEaeuDocTypes)
          ELSE dt.code IN (:profileDefaultMigrantDocTypes)
        END
      )`
    : "dt.code IN (:profileExternalDocTypes)";

  const cte = `
    WITH filtered_employees AS (
      SELECT DISTINCT
        e.id AS employee_id,
        e.last_name_enc,
        e.last_name_key_version,
        e.first_name,
        e.middle_name,
        e.passport_number_enc,
        e.passport_number_key_version,
        e.passport_date,
        e.passport_expiry_date,
        e.kig_enc,
        e.kig_key_version,
        e.kig_end_date,
        e.patent_number_enc,
        e.patent_number_key_version,
        e.patent_issue_date,
        e.blank_number,
        c.id AS counterparty_id,
        c.name AS counterparty_name,
        CASE
          WHEN LOWER(COALESCE(ctz.code, '')) IN ('ru', 'rus', '643') THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%рос%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%russia%' THEN TRUE
          ELSE FALSE
        END AS is_russian_citizenship,
        CASE
          WHEN COALESCE(ctz.is_eaeu, FALSE) = TRUE THEN TRUE
          WHEN LOWER(COALESCE(ctz.code, '')) IN ('by', 'blr', '112', 'rb', 'kz', 'kaz', '398', 'kg', 'kgz', '417', 'am', 'arm', '051') THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%беларус%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%belarus%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%белорус%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%казах%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%kazakh%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%киргиз%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%кыргыз%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%kyrgyz%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%армени%' THEN TRUE
          WHEN LOWER(COALESCE(ctz.name, '')) LIKE '%armenia%' THEN TRUE
          ELSE FALSE
        END AS is_eaeu_citizenship
      FROM employees e
      INNER JOIN employee_counterparty_mapping ecm
        ON ecm.employee_id = e.id
      INNER JOIN counterparties c
        ON c.id = ecm.counterparty_id
      LEFT JOIN citizenships ctz
        ON ctz.id = e.citizenship_id
      WHERE ${employeeWhere.join(" AND ")}
    ),
    base_raw AS (
      SELECT
        fe.employee_id,
        fe.counterparty_id,
        fe.counterparty_name,
        fe.last_name_enc,
        fe.last_name_key_version,
        fe.first_name,
        fe.middle_name,
        fe.passport_number_enc,
        fe.passport_number_key_version,
        fe.kig_enc,
        fe.kig_key_version,
        fe.patent_number_enc,
        fe.patent_number_key_version,
        fe.blank_number,
        dt.id AS document_type_id,
        dt.code AS document_type_code,
        dt.name AS document_type_name,
        ${hasRequiredColumn ? "dt.is_required" : "FALSE"} AS document_type_required,
        CASE
          WHEN dt.code = 'passport' THEN fe.passport_date::date
          WHEN dt.code IN ('patent_front', 'patent_back', 'patent_payment_receipt') THEN fe.patent_issue_date::date
          ELSE NULL
        END AS issue_date,
        ${expiryDateSql} AS expiry_date,
        lf.id AS file_id,
        lf.file_name,
        lf.original_name,
        lf.file_path,
        lf.mime_type,
        lf.created_at AS uploaded_at
      FROM filtered_employees fe
      CROSS JOIN document_types dt
      LEFT JOIN LATERAL (
        SELECT
          f.id,
          f.file_name,
          f.original_name,
          f.file_path,
          f.mime_type,
          f.created_at
        FROM files f
        WHERE f.employee_id = fe.employee_id
          AND f.entity_type = 'employee'
          AND f.is_deleted = FALSE
          AND f.document_type::text = dt.code
        ORDER BY f.created_at DESC
        LIMIT 1
      ) lf ON TRUE
      WHERE ${documentWhere.join(" AND ")}
        AND ${profileConditionSql}
    ),
    base_data AS (
      SELECT
        br.*,
        CASE
          WHEN br.file_id IS NULL OR br.file_path IS NULL OR br.file_path = '' THEN 'not_uploaded'
          WHEN br.expiry_date IS NOT NULL
            AND br.expiry_date <= (CURRENT_DATE + (:expiringDays || ' days')::interval)::date
            THEN 'expiring'
          ELSE 'uploaded'
        END AS doc_status
      FROM base_raw br
    )
  `;

  return { cte, replacements, statusWhere, empty: false };
};

const mapRow = (row) => {
  const lastName = resolveEncryptedValue(
    null,
    row.last_name_enc,
    row.last_name_key_version,
  );

  return {
    employeeId: row.employee_id,
    counterpartyId: row.counterparty_id,
    counterpartyName: row.counterparty_name,
    employeeFullName: buildEmployeeFullName(
      lastName,
      row.first_name,
      row.middle_name,
    ),
    documentTypeId: row.document_type_id,
    documentType: row.document_type_code,
    documentTypeName: row.document_type_name,
    isRequired: Boolean(row.document_type_required),
    seriesNumber: resolveSeriesNumber(row),
    issueDate: normalizeDate(row.issue_date),
    expiryDate: normalizeDate(row.expiry_date),
    status: row.doc_status,
    statusLabel: STATUS_LABELS[row.doc_status] || row.doc_status,
    fileId: row.file_id || null,
    fileName: row.file_name || null,
    originalName: row.original_name || null,
    filePath: row.file_path || null,
    mimeType: row.mime_type || null,
    uploadedAt: row.uploaded_at || null,
  };
};

const fetchDocumentRows = async ({ req, withPagination }) => {
  const filters = {
    counterpartyId: normalizeSearch(req.query.counterpartyId),
    documentType: normalizeSearch(req.query.documentType),
    status: normalizeSearch(req.query.status),
    employeeSearch: normalizeSearch(req.query.employeeSearch),
    employeeIds: normalizeIdList(req.query.employeeIds),
  };

  if (filters.status && !DOCUMENT_STATUSES.has(filters.status)) {
    throw new AppError("Неверный статус документа", 400);
  }

  const page = normalizePositiveInt(req.query.page, DEFAULT_PAGE);
  const requestedLimit = normalizePositiveInt(req.query.limit, DEFAULT_LIMIT);
  const limit = Math.min(
    requestedLimit,
    withPagination ? MAX_LIMIT : MAX_EXPORT_ROWS,
  );
  const offset = (page - 1) * limit;

  const queryContext = await buildDocumentCte({ user: req.user, filters });
  if (queryContext.empty) {
    return {
      rows: [],
      total: 0,
      page,
      limit,
      filters,
    };
  }

  const { cte, replacements, statusWhere } = queryContext;
  const statusClause =
    statusWhere.length > 0 ? `WHERE ${statusWhere.join(" AND ")}` : "";

  const rowsQuery = `
    ${cte}
    SELECT *
    FROM base_data bd
    ${statusClause}
    ORDER BY bd.first_name ASC, bd.middle_name ASC, bd.document_type_name ASC
    ${withPagination ? "LIMIT :limit OFFSET :offset" : ""}
  `;

  const countQuery = `
    ${cte}
    SELECT COUNT(*)::int AS total
    FROM base_data bd
    ${statusClause}
  `;

  const rowReplacements = withPagination
    ? { ...replacements, limit, offset }
    : replacements;

  const [rawRows, countRows] = await Promise.all([
    sequelize.query(rowsQuery, {
      replacements: rowReplacements,
      type: QueryTypes.SELECT,
    }),
    sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT,
    }),
  ]);

  const total = Number(countRows?.[0]?.total || 0);
  return {
    rows: rawRows.map(mapRow),
    total,
    page,
    limit,
    filters,
  };
};

export const getCounterpartyDocumentsTable = async (req, res, next) => {
  try {
    const result = await fetchDocumentRows({ req, withPagination: true });

    res.json({
      success: true,
      data: {
        items: result.rows,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          pages: Math.ceil(result.total / result.limit) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const exportCounterpartyDocumentsExcel = async (req, res, next) => {
  try {
    const result = await fetchDocumentRows({ req, withPagination: false });
    const rows = result.rows.slice(0, MAX_EXPORT_ROWS);

    const worksheetRows = rows.map((item, index) => ({
      "№": index + 1,
      Контрагент: item.counterpartyName || "-",
      Сотрудник: item.employeeFullName || "-",
      "Тип документа": item.documentTypeName || item.documentType,
      "Серия/Номер": item.seriesNumber || "-",
      "Дата выдачи": item.issueDate || "-",
      "Срок действия": item.expiryDate || "-",
      Статус: item.statusLabel,
      "Обязательный тип": item.isRequired ? "Да" : "Нет",
      "Файл загружен": item.fileId ? "Да" : "Нет",
      "Имя файла": item.fileName || "-",
      "Дата загрузки": item.uploadedAt
        ? new Date(item.uploadedAt).toISOString()
        : "-",
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Документы");
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const fileName = `counterparty_documents_${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(excelBuffer);
  } catch (error) {
    next(error);
  }
};

export const downloadCounterpartyDocumentsZip = async (req, res, next) => {
  try {
    const result = await fetchDocumentRows({ req, withPagination: false });
    const uploadedRows = result.rows
      .filter((item) => item.fileId && item.filePath)
      .slice(0, MAX_EXPORT_ROWS);

    if (uploadedRows.length === 0) {
      throw new AppError("Нет загруженных документов для выгрузки", 400);
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (error) => {
      if (!res.headersSent) {
        next(error);
      }
    });

    const fileName = `counterparty_documents_${new Date().toISOString().split("T")[0]}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    archive.pipe(res);

    for (const row of uploadedRows) {
      try {
        const downloadData = await storageProvider.getDownloadUrl(
          row.filePath,
          {
            expiresIn: 3600,
            fileName: row.originalName || row.fileName,
          },
        );
        const fileResponse = await axios.get(downloadData.url, {
          responseType: "stream",
          timeout: 45000,
        });

        const fileLabel = sanitizeZipSegment(
          row.originalName || row.fileName || `${row.fileId}.bin`,
        );
        const entryName = buildSafeZipEntryName(
          row.counterpartyName,
          row.employeeFullName,
          `${sanitizeZipSegment(row.documentTypeName)}_${fileLabel}`,
        );
        archive.append(fileResponse.data, { name: entryName });
      } catch (error) {
        console.error(`Error adding file ${row.fileId} to zip:`, error.message);
      }
    }

    await archive.finalize();
  } catch (error) {
    next(error);
  }
};
