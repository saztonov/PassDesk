import { randomUUID } from "crypto";
import { Op } from "sequelize";
import sequelize from "../config/database.js";
import {
  Employee,
  Pass,
  Counterparty,
  Citizenship,
  CitizenshipSynonym,
  Department,
  EmployeeCounterpartyMapping,
  Position,
} from "../models/index.js";
import {
  buildEmployeeSensitiveFieldsPatch,
  applyLegacySensitivePlaintextPolicy,
} from "../services/employeeSensitiveFieldService.js";
import { AppError } from "../middleware/errorHandler.js";

// Системный userId для записей созданных синхронизацией.
// Должен быть UUID существующего сервисного пользователя в таблице users.
const getSyncUserId = () => {
  const id = process.env.SYNC_1C_USER_ID;
  if (!id) throw new AppError("SYNC_1C_USER_ID не задан на сервере", 500);
  return id;
};

// Разбивает "Фамилия Имя Отчество" на части
const parseFio = (fio = "") => {
  const parts = fio.trim().split(/\s+/);
  return {
    lastName: parts[0] ?? null,
    firstName: parts[1] ?? null,
    middleName: parts[2] ?? null,
  };
};

// Нормализует СНИЛС: убирает всё кроме цифр → 11 цифр или null
const normalizeSnils = (raw) => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
};

// Нормализует ИНН: убирает пробелы
const normalizeInn = (raw) => {
  if (!raw) return null;
  const clean = String(raw).trim();
  return clean.length > 0 ? clean : null;
};

// Ищет гражданство по имени или синониму (case-insensitive)
const findCitizenshipByName = async (name) => {
  if (!name) return null;
  const synonym = await CitizenshipSynonym.findOne({
    where: sequelize.where(
      sequelize.fn("lower", sequelize.col("synonym")),
      name.toLowerCase()
    ),
  });
  if (synonym) return synonym.citizenshipId;

  const citizenship = await Citizenship.findOne({
    where: sequelize.where(
      sequelize.fn("lower", sequelize.col("name")),
      name.toLowerCase()
    ),
    attributes: ["id"],
  });
  return citizenship?.id ?? null;
};

// Ищет подразделение по названию среди подразделений СУ-10 (counterparty_id IS NULL)
const findDepartmentByName = async (name) => {
  if (!name) return null;
  const dept = await Department.findOne({
    where: {
      name,
      counterpartyId: null,
    },
    attributes: ["id"],
  });
  return dept?.id ?? null;
};

// Ищет должность по названию
const findPositionByName = async (name) => {
  if (!name) return null;
  const pos = await Position.findOne({
    where: { name },
    attributes: ["id"],
  });
  return pos?.id ?? null;
};

// Строит объект полей сотрудника из записи 1С
const buildEmployeeFields = async (record, syncUserId) => {
  const fio = parseFio(record["ФизЛицо"]);
  const citizenshipId = await findCitizenshipByName(record["Гражданство"]);
  const departmentId = await findDepartmentByName(record["Отдел"]);
  const positionId = await findPositionByName(record["Должность"]);

  // Серия + номер паспорта объединяются (РФ: серия 4 цифры, номер 6 цифр)
  const passportSeries = record["Паспорт_Серия"] ?? "";
  const passportNum = record["Паспорт_Номер"] ?? "";
  const passportNumber = passportSeries || passportNum
    ? `${passportSeries}${passportNum}`.trim()
    : null;

  const fields = {
    ...fio,
    birthDate: record["ДатаРождения"] ?? null,
    phone: record["ТелефонФЛ"] ?? null,
    passportType: record["Паспорт_Вид"] ?? null,
    passportNumber,
    passportDate: record["Паспорт_ДатаВыдачи"] ?? null,
    passportIssuer: record["Паспорт_КемВыдан"] ?? null,
    passportDepartmentCode: record["Паспорт_КодПодразделения"] ?? null,
    passportExpiryDate: record["Паспорт_ФМС_ДокументСрокДействия"] ?? null,
    registrationAddress: record["АдресПоПрописке"] ?? null,
    patentNumber: record["Патент_Номер"] ?? null,
    blankNumber: record["Патент_Серия"] ?? null,
    patentIssueDate: record["Патент_ДатаВыдачи"] ?? null,
    kig: record["КИГ"] ?? null,
    citizenshipId,
    positionId,
    updatedBy: syncUserId,
  };

  // departmentId не поле employees — используется при создании маппинга (вне этого контроллера)
  // Сохраняем для возврата вызывающему коду
  fields._departmentId = departmentId;

  const sensitiveFields = applyLegacySensitivePlaintextPolicy(fields);
  const sensitivesPatch = buildEmployeeSensitiveFieldsPatch(fields);

  return { ...sensitiveFields, ...sensitivesPatch };
};

// Определяет поля-конфликты между 1С и порталом для защищённых полей
const detectProtectedFieldConflicts = (employee, record) => {
  const conflicts = [];
  const inn1c = normalizeInn(record["ИНН"]);
  const snils1c = normalizeSnils(record["СтраховойНомерПФР"]);

  if (inn1c && employee.inn && employee.inn !== inn1c) {
    conflicts.push({ field: "inn", portal: employee.inn, "1c": inn1c });
  }
  if (snils1c && employee.snils && employee.snils !== snils1c) {
    conflicts.push({ field: "snils", portal: employee.snils, "1c": snils1c });
  }
  return conflicts;
};

// Синхронизирует пропуск сотрудника: обновляет номер или создаёт pending-пропуск
const syncPassNumber = async (employeeId, passNumber, t) => {
  if (!passNumber) return;

  const existing = await Pass.findOne({ where: { employeeId }, transaction: t });
  if (existing) {
    if (existing.passNumber !== passNumber) {
      await existing.update({ passNumber }, { transaction: t });
    }
    return;
  }

  const now = new Date();
  const farFuture = new Date(now);
  farFuture.setFullYear(farFuture.getFullYear() + 1);

  await Pass.create({
    employeeId,
    passNumber,
    passType: "temporary",
    validFrom: now,
    validUntil: farFuture,
    status: "pending",
  }, { transaction: t });
};

const formatGenderFor1c = (gender) => {
  if (gender === "male") return "М";
  if (gender === "female") return "Ж";
  return gender ?? null;
};

const serializeCitizenshipRef = (citizenship) =>
  citizenship
    ? {
        id: citizenship.id,
        name: citizenship.name,
        code: citizenship.code,
      }
    : null;

const getActiveCounterpartyMapping = (employee) => {
  const mappings = employee.employeeCounterpartyMappings || [];
  return (
    mappings.find((mapping) => !mapping.dismissedAt) ||
    mappings[0] ||
    null
  );
};

// ─── POST /sync/1c/employees ────────────────────────────────────────────────

export const receiveEmployees = async (req, res, next) => {
  try {
    const { employees = [] } = req.body;
    if (!Array.isArray(employees) || employees.length === 0) {
      throw new AppError("Поле employees должно быть непустым массивом", 400);
    }

    const runId = randomUUID();
    const syncUserId = getSyncUserId();
    const logs = [];
    const result = { runId, created: 0, updated: 0, skipped: 0, conflicts: [] };

    await sequelize.transaction(async (t) => {
      for (const record of employees) {
        const idAll = record["Физлицо_id_all"];
        if (!idAll) {
          logs.push({ runId, direction: "from_1c", entityType: "employee", entityId: "unknown", status: "error", detail: { reason: "Отсутствует Физлицо_id_all" } });
          continue;
        }

        const changedAt1c = record["ДатаИзменения"] ? new Date(record["ДатаИзменения"]) : null;

        const existing = await Employee.findOne({ where: { idAll }, transaction: t });

        if (existing) {
          // Если в портале запись новее — пропускаем (портал — источник истины)
          if (changedAt1c && existing.updatedAt > changedAt1c) {
            result.skipped++;
            logs.push({ runId, direction: "from_1c", entityType: "employee", entityId: idAll, status: "skipped", detail: { reason: "portal_newer" } });
            continue;
          }

          // Проверяем конфликты по защищённым полям
          const conflicts = detectProtectedFieldConflicts(existing, record);
          if (conflicts.length > 0) {
            result.conflicts.push({ idAll, name: record["ФизЛицо"], fields: conflicts });
            logs.push({ runId, direction: "from_1c", entityType: "employee", entityId: idAll, status: "conflict", detail: { conflicts } });
            continue;
          }

          const fields = await buildEmployeeFields(record, syncUserId);
          delete fields._departmentId;
          await existing.update(fields, { transaction: t });
          await syncPassNumber(existing.id, record["НомерПропуска"], t);
          result.updated++;
          logs.push({ runId, direction: "from_1c", entityType: "employee", entityId: idAll, status: "updated" });
        } else {
          // Создаём нового сотрудника
          const fields = await buildEmployeeFields(record, syncUserId);
          const inn = normalizeInn(record["ИНН"]);
          const snils = normalizeSnils(record["СтраховойНомерПФР"]);

          try {
            const created = await Employee.create({
              ...fields,
              idAll,
              inn: inn ?? undefined,
              snils: snils ?? undefined,
              createdBy: syncUserId,
            }, { transaction: t });
            await syncPassNumber(created.id, record["НомерПропуска"], t);
            result.created++;
            logs.push({ runId, direction: "from_1c", entityType: "employee", entityId: idAll, status: "created" });
          } catch (err) {
            // R2: параллельный запрос мог уже создать эту запись — обновляем вместо падения
            if (err.name !== "SequelizeUniqueConstraintError") throw err;
            const concurrent = await Employee.findOne({ where: { idAll }, transaction: t });
            if (concurrent) {
              delete fields._departmentId;
              await concurrent.update(fields, { transaction: t });
              await syncPassNumber(concurrent.id, record["НомерПропуска"], t);
              result.updated++;
              logs.push({ runId, direction: "from_1c", entityType: "employee", entityId: idAll, status: "updated", detail: { reason: "race_resolved" } });
            }
          }
        }
      }

      // Пишем журнал одним батчем (R1: ?::jsonb для колонки JSONB)
      if (logs.length > 0) {
        await sequelize.query(
          `INSERT INTO sync_1c_log (run_id, direction, entity_type, entity_id, status, detail)
           VALUES ${logs.map(() => "(?, ?, ?, ?, ?, ?::jsonb)").join(",")}`,
          {
            replacements: logs.flatMap((l) => [
              l.runId, l.direction, l.entityType, l.entityId, l.status,
              l.detail ? JSON.stringify(l.detail) : null,
            ]),
            transaction: t,
          }
        );
      }
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

// ─── GET /sync/1c/employees/changes ─────────────────────────────────────────

export const getChanges = async (req, res, next) => {
  try {
    const { since } = req.query;
    if (!since) {
      throw new AppError("Параметр since обязателен (ISO 8601)", 400);
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      throw new AppError("Некорректный формат since, ожидается ISO 8601", 400);
    }

    const employees = await Employee.findAll({
      where: {
        updatedAt: { [Op.gt]: sinceDate },
        isDeleted: false,
      },
      include: [
        {
          model: Citizenship,
          as: "citizenship",
          attributes: ["id", "name", "code"],
          required: false,
        },
        {
          model: Citizenship,
          as: "birthCountry",
          attributes: ["id", "name", "code"],
          required: false,
        },
        {
          model: Position,
          as: "position",
          attributes: ["id", "name"],
          required: false,
        },
        {
          model: EmployeeCounterpartyMapping,
          as: "employeeCounterpartyMappings",
          attributes: ["id", "counterpartyId", "dismissedAt"],
          required: false,
          include: [
            {
              model: Counterparty,
              as: "counterparty",
              attributes: ["id", "name", "inn", "kpp"],
              required: false,
            },
          ],
        },
      ],
      order: [
        ["updatedAt", "ASC"],
        [
          {
            model: EmployeeCounterpartyMapping,
            as: "employeeCounterpartyMappings",
          },
          "dismissedAt",
          "ASC",
        ],
      ],
      // Без ограничения attributes — Sequelize загружает *Enc-поля, геттеры расшифровывают
    });

    const serialized = employees.map((e) => {
      const activeMapping = getActiveCounterpartyMapping(e);
      const counterparty = activeMapping?.counterparty || null;
      const citizenship = serializeCitizenshipRef(e.citizenship);
      const birthCountry = serializeCitizenshipRef(e.birthCountry);

      return {
        id: e.id,
        idAll: e.idAll,
        firstName: e.firstName,
        lastName: e.lastName,
        middleName: e.middleName,
        gender: e.gender,
        genderLabel: formatGenderFor1c(e.gender),
        birthDate: e.birthDate,
        birthCountry: birthCountry?.code || citizenship?.code || null,
        birthCountryName: birthCountry?.name || citizenship?.name || null,
        birthCountryCode: birthCountry?.code || citizenship?.code || null,
        birthRegion: e.birthRegion,
        birthCity: e.birthCity,
        inn: e.inn,
        snils: e.snils,
        phone: e.phone,
        passportType: e.passportType,
        passportNumber: e.passportNumber,
        passportDate: e.passportDate,
        passportIssuer: e.passportIssuer,
        passportDepartmentCode: e.passportDepartmentCode,
        passportExpiryDate: e.passportExpiryDate,
        registrationAddress: e.registrationAddress,
        patentNumber: e.patentNumber,
        blankNumber: e.blankNumber,
        patentIssueDate: e.patentIssueDate,
        kig: e.kig,
        kigEndDate: e.kigEndDate,
        citizenship: citizenship?.name || null,
        citizenshipCode: citizenship?.code || null,
        position: e.position?.name || null,
        organization: counterparty?.name || null,
        organizationInn: counterparty?.inn || null,
        organizationKpp: counterparty?.kpp || null,
        counterpartyId: counterparty?.id || null,
        bankAccountNumber: e.bankAccountNumber,
        bankBik: e.bankBik,
        updatedAt: e.updatedAt,
        isActive: e.isActive,
      };
    });

    res.json({ count: serialized.length, employees: serialized });
  } catch (err) {
    next(err);
  }
};
