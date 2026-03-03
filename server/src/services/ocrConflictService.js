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
  const conflicts = await EmployeeOcrConflict.findAll({
    where: {
      employeeId,
      status: "open",
    },
    include: [
      {
        model: File,
        as: "file",
        attributes: ["id"],
        required: true,
        where: {
          isDeleted: false,
        },
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  const documentsMap = new Map();

  conflicts.forEach((conflict) => {
    const documentType = normalizeString(conflict.documentType) || "unknown";
    const current = documentsMap.get(documentType) || {
      documentType,
      conflictsCount: 0,
    };
    current.conflictsCount += 1;
    documentsMap.set(documentType, current);
  });

  return {
    hasConflicts: conflicts.length > 0,
    conflictsCount: conflicts.length,
    documents: Array.from(documentsMap.values()),
    lastDetectedAt: conflicts[0]?.createdAt || null,
  };
};

export const listEmployeeOcrConflicts = async ({
  status = "open",
  page = 1,
  limit = 50,
}) => {
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offset = (normalizedPage - 1) * normalizedLimit;

  const where = {};
  if (status && status !== "all") {
    where.status = status;
  }

  const { count, rows } = await EmployeeOcrConflict.findAndCountAll({
    where,
    distinct: true,
    include: [
      {
        model: Employee,
        as: "employee",
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
      {
        model: File,
        as: "file",
        attributes: ["id", "fileName", "originalName", "documentType"],
        required: true,
        where: {
          isDeleted: false,
        },
      },
      {
        model: User,
        as: "resolver",
        attributes: ["id", "firstName", "lastName", "email"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
    offset,
    limit: normalizedLimit,
  });

  return {
    items: rows.map((item) => ({
      id: item.id,
      status: item.status,
      documentType: item.documentType,
      ocrDocumentType: item.ocrDocumentType,
      fieldName: item.fieldName,
      fieldLabel: item.fieldLabel,
      currentValue: item.currentValue,
      ocrValue: item.ocrValue,
      createdAt: item.createdAt,
      resolvedAt: item.resolvedAt,
      employee: item.employee
        ? {
            id: item.employee.id,
            fullName: getEmployeeFullName(item.employee),
            counterpartyName: getCounterpartyName(item.employee),
          }
        : null,
      file: item.file
        ? {
            id: item.file.id,
            fileName: item.file.fileName,
            originalName: item.file.originalName,
            documentType: item.file.documentType,
          }
        : null,
      resolver: item.resolver
        ? {
            id: item.resolver.id,
            fullName: [item.resolver.lastName, item.resolver.firstName]
              .filter(Boolean)
              .join(" ")
              .trim(),
            email: item.resolver.email,
          }
        : null,
    })),
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total: count,
      pages: Math.ceil(count / normalizedLimit),
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
