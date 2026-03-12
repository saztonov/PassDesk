import axios from "axios";
import { Op } from "sequelize";
import {
  Employee,
  EmployeeCounterpartyMapping,
  EmployeeOcrConflict,
  File,
  Counterparty,
  User,
} from "../models/index.js";
import {
  applyLegacySensitivePlaintextPolicy,
  buildEmployeeSensitiveFieldsPatch,
} from "./employeeSensitiveFieldService.js";

const normalizeString = (value) => String(value || "").trim();

const DOCUMENT_TYPE_LABELS = {
  passport: "Паспорт",
  passport_translation: "Перевод паспорта",
  inn_document: "ИНН",
  bank_details: "Реквизиты счета",
  snils_card: "СНИЛС",
  patent_front: "Патент (лицевая)",
  patent_back: "Патент (оборот)",
  visa: "Виза",
  kig: "КИГ",
};

const getEmployeeFullName = (employee) =>
  [employee?.lastName, employee?.firstName, employee?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Сотрудник";

const getCounterpartyName = (employee) =>
  employee?.employeeCounterpartyMappings?.[0]?.counterparty?.name || "Без контрагента";

const DATE_FIELDS = new Set([
  "birthDate",
  "passportDate",
  "passportExpiryDate",
  "kigEndDate",
  "patentIssueDate",
]);

const DIGITS_ONLY_FIELDS = new Map([
  ["inn", 12],
  ["snils", 11],
  ["bankAccountNumber", 20],
]);

const FIO_FIELDS = [
  { fieldName: "lastName", fieldLabel: "Фамилия" },
  { fieldName: "firstName", fieldLabel: "Имя" },
  { fieldName: "middleName", fieldLabel: "Отчество" },
];

const OCR_FIO_DOCUMENT_TYPES = new Set([
  "passport",
  "passport_translation",
  "inn_document",
  "snils_card",
  "kig",
  "patent_front",
  "patent_back",
  "patent_payment_receipt",
  "bank_details",
]);

const normalizeComparableText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");

const getTimestampValue = (value) => {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const parseOcrResultPayload = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return null;
};

const getNormalizedOcrResult = (file) => {
  const payload = parseOcrResultPayload(file?.ocrResultJson);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const normalized = payload.normalized;
  return normalized && typeof normalized === "object" ? normalized : null;
};

const hasFioValue = (normalized = {}) =>
  Boolean(
    normalizeString(normalized.lastName) ||
      normalizeString(normalized.firstName) ||
      normalizeString(normalized.middleName),
  );

const resolveFioSourceKey = (documentType) => {
  const normalizedDocumentType = normalizeString(documentType);

  if (
    normalizedDocumentType === "passport" ||
    normalizedDocumentType === "passport_translation"
  ) {
    return "passport_source";
  }

  if (
    normalizedDocumentType === "patent_front" ||
    normalizedDocumentType === "patent_back" ||
    normalizedDocumentType === "patent_payment_receipt"
  ) {
    return "patent";
  }

  return normalizedDocumentType || "unknown";
};

const getPreferredSourceTimestamp = (file) =>
  Math.max(getTimestampValue(file?.ocrVerifiedAt), getTimestampValue(file?.createdAt));

const shouldReplaceFioSource = (existingSource, nextSource) => {
  if (!existingSource) {
    return true;
  }

  if (nextSource.sourceKey === "passport_source") {
    const existingIsTranslation = existingSource.documentType === "passport_translation";
    const nextIsTranslation = nextSource.documentType === "passport_translation";

    if (nextIsTranslation && !existingIsTranslation) {
      return true;
    }

    if (!nextIsTranslation && existingIsTranslation) {
      return false;
    }
  }

  return nextSource.timestamp >= existingSource.timestamp;
};

const buildFioSourcesByEmployee = (files = []) => {
  const employeeMap = new Map();

  files.forEach((file) => {
    const employeeId = normalizeString(file?.employeeId);
    if (!employeeId) {
      return;
    }

    const normalized = getNormalizedOcrResult(file);
    if (!normalized || !hasFioValue(normalized)) {
      return;
    }

    const sourceKey = resolveFioSourceKey(file.documentType);
    const nextSource = {
      sourceKey,
      documentType: file.documentType,
      documentLabel: DOCUMENT_TYPE_LABELS[file.documentType] || file.documentType || "Документ",
      fileId: file.id,
      fileName: file.originalName || file.fileName || "—",
      createdAt: file.ocrVerifiedAt || file.createdAt || null,
      timestamp: getPreferredSourceTimestamp(file),
      values: {
        lastName: normalizeString(normalized.lastName),
        firstName: normalizeString(normalized.firstName),
        middleName: normalizeString(normalized.middleName),
      },
    };

    const currentEmployee = employeeMap.get(employeeId) || {
      employee: file.employee
        ? {
            id: file.employee.id,
            fullName: getEmployeeFullName(file.employee),
            counterpartyName: getCounterpartyName(file.employee),
          }
        : null,
      sources: new Map(),
    };

    if (
      shouldReplaceFioSource(currentEmployee.sources.get(sourceKey), nextSource)
    ) {
      currentEmployee.sources.set(sourceKey, nextSource);
    }

    employeeMap.set(employeeId, currentEmployee);
  });

  return employeeMap;
};

const parseDateValue = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split(".");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const normalizeConflictValueForEmployeeField = (fieldName, value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (DATE_FIELDS.has(fieldName)) {
    return parseDateValue(value);
  }

  if (DIGITS_ONLY_FIELDS.has(fieldName)) {
    return normalizeString(value)
      .replace(/[^\d]/g, "")
      .slice(0, DIGITS_ONLY_FIELDS.get(fieldName));
  }

  if (fieldName === "citizenshipId") {
    const normalized = normalizeString(value);
    return normalized || null;
  }

  if (fieldName === "gender") {
    const normalized = normalizeString(value).toLowerCase();
    return normalized === "male" || normalized === "female" ? normalized : null;
  }

  const normalized = normalizeString(value);
  return normalized || null;
};

const buildEmployeePatchForConflict = (conflict) => {
  const normalizedValue = normalizeConflictValueForEmployeeField(
    conflict.fieldName,
    conflict.ocrValue,
  );

  return {
    [conflict.fieldName]: normalizedValue,
  };
};

const toConflictPayload = (conflict = {}) => {
  const fieldName = normalizeString(conflict.fieldName);
  if (!fieldName) return null;

  return {
    fieldName,
    fieldLabel: normalizeString(conflict.fieldLabel) || fieldName,
    currentValue:
      conflict.currentValue === null || conflict.currentValue === undefined
        ? null
        : String(conflict.currentValue),
    ocrValue:
      conflict.ocrValue === null || conflict.ocrValue === undefined
        ? null
        : String(conflict.ocrValue),
  };
};

export const saveEmployeeOcrConflicts = async ({
  employeeId,
  fileId,
  documentType = null,
  ocrDocumentType = null,
  conflicts = [],
  createdBy = null,
}) => {
  const normalizedConflicts = conflicts
    .map(toConflictPayload)
    .filter(Boolean);

  const activeFieldNames = normalizedConflicts.map((item) => item.fieldName);

  if (activeFieldNames.length === 0) {
    await EmployeeOcrConflict.update(
      {
        status: "resolved",
        resolvedBy: createdBy,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      },
      {
        where: {
          employeeId,
          fileId,
          status: "open",
        },
      },
    );

    return {
      created: [],
      reopened: [],
      active: [],
    };
  }

  await EmployeeOcrConflict.update(
    {
      status: "resolved",
      resolvedBy: createdBy,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    },
    {
      where: {
        employeeId,
        fileId,
        status: "open",
        fieldName: {
          [Op.notIn]: activeFieldNames,
        },
      },
    },
  );

  const created = [];
  const reopened = [];
  const active = [];

  for (const conflict of normalizedConflicts) {
    const existing = await EmployeeOcrConflict.findOne({
      where: {
        employeeId,
        fileId,
        fieldName: conflict.fieldName,
      },
    });

    const payload = {
      employeeId,
      fileId,
      documentType,
      ocrDocumentType,
      fieldName: conflict.fieldName,
      fieldLabel: conflict.fieldLabel,
      currentValue: conflict.currentValue,
      ocrValue: conflict.ocrValue,
      status: "open",
      createdBy,
      resolvedBy: null,
      resolvedAt: null,
      metadata: {
        source: "ocr_auto_compare",
      },
    };

    if (!existing) {
      const record = await EmployeeOcrConflict.create(payload);
      created.push(record);
      active.push(record);
      continue;
    }

    const wasResolved = existing.status === "resolved";
    await existing.update(payload);
    if (wasResolved) {
      reopened.push(existing);
    }
    active.push(existing);
  }

  return {
    created,
    reopened,
    active,
  };
};

export const getEmployeeOcrConflictSummary = async (employeeId) => {
  const conflicts = await listEmployeeOcrConflicts({
    employeeId,
    page: 1,
    limit: 200,
  });
  const documentsMap = new Map();

  conflicts.items.forEach((conflict) => {
    (conflict.sources || []).forEach((source) => {
      const documentType = normalizeString(source.documentType) || "unknown";
      const current = documentsMap.get(documentType) || {
        documentType,
        conflictsCount: 0,
      };
      current.conflictsCount += 1;
      documentsMap.set(documentType, current);
    });
  });

  const lastDetectedAt = conflicts.items.reduce((latest, item) => {
    if (!latest || getTimestampValue(item.createdAt) > getTimestampValue(latest)) {
      return item.createdAt;
    }
    return latest;
  }, null);

  return {
    hasConflicts: conflicts.items.length > 0,
    conflictsCount: conflicts.items.length,
    documents: Array.from(documentsMap.values()),
    lastDetectedAt,
  };
};

export const listEmployeeOcrConflicts = async ({
  status: _status = "open",
  employeeId = null,
  page = 1,
  limit = 50,
}) => {
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offset = (normalizedPage - 1) * normalizedLimit;

  const files = await File.findAll({
    where: {
      entityType: "employee",
      isDeleted: false,
      ocrVerified: true,
      ...(employeeId ? { employeeId } : {}),
      documentType: {
        [Op.in]: [...OCR_FIO_DOCUMENT_TYPES],
      },
      ocrResultJson: {
        [Op.ne]: null,
      },
    },
    include: [
      {
        model: Employee,
        as: "employee",
        required: true,
        attributes: ["id", "firstName", "lastName", "middleName"],
        include: [
          {
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
            required: false,
            attributes: ["id", "counterpartyId"],
            include: [
              {
                model: Counterparty,
                as: "counterparty",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      },
    ],
    attributes: [
      "id",
      "employeeId",
      "fileName",
      "originalName",
      "documentType",
      "createdAt",
      "ocrVerifiedAt",
      "ocrResultJson",
    ],
    order: [
      ["employeeId", "ASC"],
      ["ocrVerifiedAt", "DESC"],
      ["createdAt", "DESC"],
    ],
  });

  const employeeSources = buildFioSourcesByEmployee(files);
  const items = [];

  employeeSources.forEach(({ employee, sources }, employeeId) => {
    const resolvedSources = [...sources.values()];

    FIO_FIELDS.forEach(({ fieldName, fieldLabel }) => {
      const sourceValues = resolvedSources
        .map((source) => ({
          documentType: source.documentType,
          documentLabel: source.documentLabel,
          fileId: source.fileId,
          fileName: source.fileName,
          createdAt: source.createdAt,
          value: source.values[fieldName] || "",
          normalizedValue: normalizeComparableText(source.values[fieldName]),
        }))
        .filter((source) => source.normalizedValue);

      if (sourceValues.length < 2) {
        return;
      }

      const distinctValues = [...new Set(sourceValues.map((item) => item.normalizedValue))];
      if (distinctValues.length < 2) {
        return;
      }

      const createdAt = sourceValues.reduce((latest, item) => {
        if (!latest || getTimestampValue(item.createdAt) > getTimestampValue(latest)) {
          return item.createdAt;
        }
        return latest;
      }, null);

      items.push({
        id: `${employeeId}:${fieldName}`,
        status: "open",
        fieldName,
        fieldLabel,
        createdAt,
        employee,
        sources: sourceValues.map((item) => ({
          documentType: item.documentType,
          documentLabel: item.documentLabel,
          fileId: item.fileId,
          fileName: item.fileName,
          createdAt: item.createdAt,
          value: item.value,
        })),
      });
    });
  });

  const sortedItems = items.sort(
    (left, right) =>
      getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt),
  );
  const paginatedItems = sortedItems.slice(offset, offset + normalizedLimit);

  return {
    items: paginatedItems,
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total: sortedItems.length,
      pages: Math.ceil(sortedItems.length / normalizedLimit),
    },
  };
};

export const resolveEmployeeOcrConflict = async ({ conflictId, resolvedBy }) => {
  const conflict = await EmployeeOcrConflict.findByPk(conflictId, {
    include: [
      {
        model: Employee,
        as: "employee",
        attributes: ["id"],
      },
    ],
  });

  if (!conflict) {
    return null;
  }

  await conflict.update({
    status: "resolved",
    resolvedBy,
    resolvedAt: new Date(),
    metadata: {
      ...(conflict.metadata || {}),
      resolution: "keep_current",
    },
  });

  return conflict;
};

export const applyEmployeeOcrConflict = async ({ conflictId, resolvedBy }) => {
  const conflict = await EmployeeOcrConflict.findByPk(conflictId, {
    include: [
      {
        model: Employee,
        as: "employee",
        attributes: ["id"],
      },
    ],
  });

  if (!conflict || !conflict.employee) {
    return null;
  }

  const rawPatch = buildEmployeePatchForConflict(conflict);
  const encryptedPatch = buildEmployeeSensitiveFieldsPatch(rawPatch);
  const normalizedPatch = applyLegacySensitivePlaintextPolicy(rawPatch);

  await conflict.employee.update({
    ...normalizedPatch,
    ...encryptedPatch,
    updatedBy: resolvedBy,
  });

  await conflict.update({
    status: "resolved",
    resolvedBy,
    resolvedAt: new Date(),
    metadata: {
      ...(conflict.metadata || {}),
      resolution: "apply_ocr",
    },
  });

  return conflict;
};

export const notifyManagersAboutOcrConflicts = async ({
  employee,
  documentType = null,
  conflicts = [],
}) => {
  const webhookUrl =
    process.env.OCR_CONFLICT_EMAIL_WEBHOOK_URL || process.env.EMAIL_WEBHOOK_URL;

  if (!webhookUrl || conflicts.length === 0) {
    return false;
  }

  const managers = await User.findAll({
    where: {
      role: "manager",
      isActive: true,
      isDeleted: false,
    },
    attributes: ["email"],
  });

  const recipients = [...new Set(managers.map((item) => item.email).filter(Boolean))];
  if (recipients.length === 0) {
    return false;
  }

  const employeeName = getEmployeeFullName(employee);
  const counterpartyName = getCounterpartyName(employee);
  const fieldLabels = [...new Set(conflicts.map((item) => item.fieldLabel).filter(Boolean))];
  const lines = [
    `Сотрудник: ${employeeName}`,
    `Контрагент: ${counterpartyName}`,
    `Документ: ${DOCUMENT_TYPE_LABELS[documentType] || documentType || "не указан"}`,
    `Расхождений: ${conflicts.length}`,
  ];

  if (fieldLabels.length > 0) {
    lines.push(`Поля: ${fieldLabels.join(", ")}`);
  }

  await Promise.allSettled(
    recipients.map((to) =>
      axios.post(webhookUrl, {
        to,
        subject: `OCR: найдены расхождения по сотруднику ${employeeName}`,
        text: lines.join("\n"),
      }),
    ),
  );

  await EmployeeOcrConflict.update(
    {
      notificationSentAt: new Date(),
    },
    {
      where: {
        id: {
          [Op.in]: conflicts.map((item) => item.id),
        },
      },
    },
  );

  return true;
};
