import { Op } from "sequelize";
import {
  Department,
  Employee,
  EmployeeCounterpartyMapping,
  Pass,
  SkudPersonBinding,
  SkudSyncJob,
} from "../../models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { enqueueSkudSyncForEmployee } from "./SkudSyncService.js";

const MAX_ROWS = 5000;

const FIELD_ALIASES = {
  fullName: ["ФИО", "Ф.И.О.", "ФИО сотрудника", "fullName", "employeeName", "name"],
  lastName: ["Фамилия", "lastName", "surname"],
  firstName: ["Имя", "firstName", "nameFirst"],
  middleName: ["Отчество", "middleName", "patronymic"],
  inn: ["ИНН", "ИНН сотрудника", "employeeInn", "inn"],
  snils: ["СНИЛС", "snils"],
  departmentName: [
    "Подразделение",
    "Группа",
    "Бригада",
    "Отдел",
    "department",
    "departmentName",
    "group",
  ],
  passNumber: [
    "Номер пропуска",
    "Текущий номер пропуска",
    "Пропуск",
    "passNumber",
    "cardNumber",
    "badgeNumber",
  ],
};

const normalizeText = (value) => String(value || "").trim();
const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");
const normalizeComparableText = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, " ");

const buildFullName = ({ lastName, firstName, middleName }) =>
  [lastName, firstName, middleName].filter(Boolean).join(" ").trim();

const resolveFieldValue = (row = {}, aliases = []) => {
  for (const alias of aliases) {
    if (!Object.prototype.hasOwnProperty.call(row, alias)) {
      continue;
    }
    const value = row[alias];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
};

const parseFullName = (value) => {
  const parts = normalizeText(value)
    .split(/\s+/)
    .filter(Boolean);

  return {
    lastName: parts[0] || "",
    firstName: parts[1] || "",
    middleName: parts.slice(2).join(" "),
  };
};

const normalizeImportRow = (row = {}, index) => {
  const resolvedFullName = resolveFieldValue(row, FIELD_ALIASES.fullName);
  const namesFromFullName = parseFullName(resolvedFullName);

  const lastName = normalizeText(
    resolveFieldValue(row, FIELD_ALIASES.lastName) || namesFromFullName.lastName,
  );
  const firstName = normalizeText(
    resolveFieldValue(row, FIELD_ALIASES.firstName) || namesFromFullName.firstName,
  );
  const middleName = normalizeText(
    resolveFieldValue(row, FIELD_ALIASES.middleName) || namesFromFullName.middleName,
  );

  return {
    rowIndex: index + 1,
    fullName: buildFullName({ lastName, firstName, middleName }),
    lastName,
    firstName,
    middleName,
    inn: normalizeDigits(resolveFieldValue(row, FIELD_ALIASES.inn)),
    snils: normalizeDigits(resolveFieldValue(row, FIELD_ALIASES.snils)),
    departmentName: normalizeText(resolveFieldValue(row, FIELD_ALIASES.departmentName)),
    passNumber: normalizeText(resolveFieldValue(row, FIELD_ALIASES.passNumber)),
    raw: row,
  };
};

const buildMismatchDetails = ({ imported, employee, localDepartmentName }) => {
  const mismatches = [];
  const localFullName = buildFullName(employee || {});

  if (
    imported.fullName &&
    localFullName &&
    normalizeComparableText(imported.fullName) !== normalizeComparableText(localFullName)
  ) {
    mismatches.push(`ФИО: "${imported.fullName}" != "${localFullName}"`);
  }

  if (imported.inn && employee?.inn && normalizeDigits(imported.inn) !== normalizeDigits(employee.inn)) {
    mismatches.push(`ИНН: "${imported.inn}" != "${employee.inn}"`);
  }

  if (
    imported.snils &&
    employee?.snils &&
    normalizeDigits(imported.snils) !== normalizeDigits(employee.snils)
  ) {
    mismatches.push(`СНИЛС: "${imported.snils}" != "${employee.snils}"`);
  }

  if (
    imported.departmentName &&
    localDepartmentName &&
    normalizeComparableText(imported.departmentName) !== normalizeComparableText(localDepartmentName)
  ) {
    mismatches.push(`Подразделение: "${imported.departmentName}" != "${localDepartmentName}"`);
  }

  return mismatches;
};

const buildPreviewSummary = (items = []) => {
  const summary = {
    totalRows: items.length,
    readyToSyncCount: 0,
    alreadyBoundCount: 0,
    syncQueuedCount: 0,
    newPassCount: 0,
    missingPassNumberCount: 0,
    duplicatePassCount: 0,
    conflictCount: 0,
  };

  items.forEach((item) => {
    if (item.status === "ready_to_sync") summary.readyToSyncCount += 1;
    else if (item.status === "already_bound") summary.alreadyBoundCount += 1;
    else if (item.status === "sync_queued") summary.syncQueuedCount += 1;
    else if (item.status === "new_pass") summary.newPassCount += 1;
    else if (item.status === "missing_pass_number") summary.missingPassNumberCount += 1;
    else if (item.status === "duplicate_pass_number") summary.duplicatePassCount += 1;
    else if (item.status === "conflict_employee_data") summary.conflictCount += 1;
  });

  return summary;
};

export const previewSkudBindingImport = async (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError("rows обязателен и должен содержать хотя бы одну строку", 400);
  }
  if (rows.length > MAX_ROWS) {
    throw new AppError(`Превышен лимит строк: максимум ${MAX_ROWS}`, 400);
  }

  const normalizedRows = rows.map((row, index) => normalizeImportRow(row, index));
  const passNumberCounts = normalizedRows.reduce((acc, row) => {
    if (!row.passNumber) return acc;
    acc[row.passNumber] = (acc[row.passNumber] || 0) + 1;
    return acc;
  }, {});

  const uniquePassNumbers = [...new Set(normalizedRows.map((row) => row.passNumber).filter(Boolean))];

  const passes = uniquePassNumbers.length
    ? await Pass.findAll({
        where: {
          passNumber: {
            [Op.in]: uniquePassNumbers,
          },
        },
        include: [
          {
            model: Employee,
            as: "employee",
            attributes: ["id", "firstName", "lastName", "middleName", "inn", "snils"],
            include: [
              {
                model: EmployeeCounterpartyMapping,
                as: "employeeCounterpartyMappings",
                required: false,
                attributes: ["id", "departmentId"],
                include: [
                  {
                    model: Department,
                    as: "department",
                    required: false,
                    attributes: ["id", "name"],
                  },
                ],
              },
              {
                model: SkudPersonBinding,
                as: "skudBindings",
                required: false,
                where: {
                  externalSystem: "sigur",
                  isActive: true,
                },
                attributes: ["id", "externalEmpId"],
              },
            ],
          },
        ],
      })
    : [];

  const passesByNumber = new Map(passes.map((pass) => [pass.passNumber, pass]));
  const employeeIds = [
    ...new Set(
      passes
        .map((pass) => pass.employeeId)
        .filter(Boolean),
    ),
  ];

  const existingSyncJobs = employeeIds.length
    ? await SkudSyncJob.findAll({
        where: {
          employeeId: {
            [Op.in]: employeeIds,
          },
          externalSystem: "sigur",
          operation: "sync_employee",
          status: {
            [Op.in]: ["pending", "processing"],
          },
        },
        attributes: ["employeeId"],
      })
    : [];

  const syncQueuedEmployeeIds = new Set(
    existingSyncJobs.map((item) => String(item.employeeId)),
  );

  const items = normalizedRows.map((row) => {
    if (!row.passNumber) {
      return {
        ...row,
        status: "missing_pass_number",
        details: ["В строке не указан номер пропуска"],
        employeeId: null,
        externalEmpId: null,
      };
    }

    if ((passNumberCounts[row.passNumber] || 0) > 1) {
      return {
        ...row,
        status: "duplicate_pass_number",
        details: [`Номер пропуска "${row.passNumber}" повторяется в файле`],
        employeeId: null,
        externalEmpId: null,
      };
    }

    const pass = passesByNumber.get(row.passNumber);
    if (!pass?.employee) {
      return {
        ...row,
        status: "new_pass",
        details: [`Пропуск "${row.passNumber}" не найден в PassDesk`],
        employeeId: null,
        externalEmpId: null,
      };
    }

    const employee = pass.employee;
    const localDepartmentName =
      employee.employeeCounterpartyMappings?.find((item) => item?.department?.name)?.department?.name
      || null;
    const mismatchDetails = buildMismatchDetails({
      imported: row,
      employee,
      localDepartmentName,
    });
    const binding = Array.isArray(employee.skudBindings) ? employee.skudBindings[0] : null;

    if (mismatchDetails.length > 0) {
      return {
        ...row,
        status: "conflict_employee_data",
        details: mismatchDetails,
        employeeId: employee.id,
        employeeName: buildFullName(employee),
        localDepartmentName,
        externalEmpId: binding?.externalEmpId || null,
      };
    }

    if (binding?.externalEmpId) {
      return {
        ...row,
        status: "already_bound",
        details: [`У сотрудника уже есть Sigur ID ${binding.externalEmpId}`],
        employeeId: employee.id,
        employeeName: buildFullName(employee),
        localDepartmentName,
        externalEmpId: binding.externalEmpId,
      };
    }

    if (syncQueuedEmployeeIds.has(String(employee.id))) {
      return {
        ...row,
        status: "sync_queued",
        details: ["Синхронизация сотрудника уже стоит в очереди"],
        employeeId: employee.id,
        employeeName: buildFullName(employee),
        localDepartmentName,
        externalEmpId: null,
      };
    }

    return {
      ...row,
      status: "ready_to_sync",
      details: ["Готово к синхронизации в Sigur"],
      employeeId: employee.id,
      employeeName: buildFullName(employee),
      localDepartmentName,
      externalEmpId: null,
    };
  });

  return {
    items,
    summary: buildPreviewSummary(items),
  };
};

export const executeSkudBindingImport = async ({ rows = [], userId }) => {
  const preview = await previewSkudBindingImport(rows);
  const readyItems = preview.items.filter((item) => item.status === "ready_to_sync" && item.employeeId);

  const uniqueItems = [...new Map(readyItems.map((item) => [item.employeeId, item])).values()];
  const jobs = [];

  for (const item of uniqueItems) {
    const job = await enqueueSkudSyncForEmployee({
      employeeId: item.employeeId,
      operation: "sync_employee",
      userId,
      source: "zup_pass_import",
      payload: {
        importRowIndex: item.rowIndex,
        importedPassNumber: item.passNumber,
        importedDepartmentName: item.departmentName || null,
        importedFullName: item.fullName || null,
      },
    });
    jobs.push({
      employeeId: item.employeeId,
      syncJobId: job.id,
      passNumber: item.passNumber,
    });
  }

  return {
    queued: jobs.length,
    jobs,
    preview,
  };
};
