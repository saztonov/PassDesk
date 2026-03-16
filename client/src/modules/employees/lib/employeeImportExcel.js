import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import * as XLSX from "xlsx";

dayjs.extend(customParseFormat);

const normalizeValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).trim().replace(/\.+$/g, "");
  if (!normalized) {
    return "";
  }

  return /[0-9A-Za-zА-Яа-яЁё]/.test(normalized) ? normalized : "";
};

const parseFullName = (value) => {
  const parts = normalizeValue(value)
    .split(/\s+/)
    .filter(Boolean);

  return {
    lastName: parts[0] || "",
    firstName: parts[1] || "",
    middleName: parts.slice(2).join(" "),
  };
};

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }

  return "";
};

const normalizeDepartmentName = (value) =>
  normalizeValue(value)
    .replace(/\/\s*закр\b/gi, "")
    .replace(/\(\d+\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const parseExcelDate = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "number") {
    const parsedDate = XLSX.SSF.parse_date_code(value);
    if (!parsedDate) {
      return null;
    }
    return dayjs(new Date(parsedDate.y, parsedDate.m - 1, parsedDate.d)).format(
      "YYYY-MM-DD",
    );
  }

  const normalized = normalizeValue(value);
  if (!normalized) {
    return null;
  }

  const parsed = dayjs(
    normalized,
    ["DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD"],
    true,
  );
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
};

const resolveNameFields = (row) => {
  if (row.ФизЛицо) {
    return parseFullName(row.ФизЛицо);
  }

  if (row["Ф.И.О."]) {
    return {
      lastName: String(row["Ф.И.О."] || "").trim(),
      firstName: String(row.__EMPTY || "").trim(),
      middleName: String(row.__EMPTY_1 || "").trim(),
    };
  }

  if (row.Фамилия) {
    return {
      lastName: String(row.Фамилия || "").trim(),
      firstName: String(row.Имя || "").trim(),
      middleName: String(row.Отчество || "").trim(),
    };
  }

  return {
    lastName: String(row.last_name || "").trim(),
    firstName: String(row.first_name || "").trim(),
    middleName: String(row.middle_name || "").trim(),
  };
};

const resolveKig = (row) => {
  const directKig = row.КИГ || row.kig;
  if (directKig) {
    return directKig;
  }

  return row["КИГ \r\nКарта иностранного гражданина"] || "";
};

const resolvePassportType = (row) => {
  const source = normalizeValue(row["Паспорт_Вид"] || row.passport_type).toLowerCase();
  if (!source) {
    return "";
  }

  if (source.includes("россий")) {
    return "russian";
  }

  return "foreign";
};

const resolvePassportNumber = (row) => {
  const series = normalizeValue(row["Паспорт_Серия"] || row.passport_series);
  const number = normalizeValue(row["Паспорт_Номер"] || row.passport_number);
  return [series, number].filter(Boolean).join(" ").trim();
};

const resolveDepartmentInfo = (row) => {
  const source = normalizeValue(row.Отдел || row.department);
  const normalizedSource = source.toLowerCase();
  const isClosedBrigade =
    normalizedSource.includes("/закр") || normalizedSource.endsWith("закр");

  return {
    department: normalizeDepartmentName(source),
    isClosedBrigade,
  };
};

const normalizeEmploymentStatus = (value) => {
  const normalized = normalizeValue(value).toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("уволен")) {
    return "fired";
  }

  if (normalized.includes("неактив")) {
    return "inactive";
  }

  if (
    normalized.includes("устроен") ||
    normalized.includes("работает") ||
    normalized.includes("актив")
  ) {
    return "employed";
  }

  return "";
};

const resolveEmploymentStatus = (row, isClosedBrigade, dismissalDate) => {
  const explicitStatus = normalizeEmploymentStatus(
    row.Статус ||
      row["Статус сотрудника"] ||
      row.СтатусСотрудника ||
      row.status ||
      row.employee_status,
  );

  if (explicitStatus) {
    return explicitStatus;
  }

  if (dismissalDate) {
    return "fired";
  }

  return isClosedBrigade ? "fired" : "";
};

const resolveDismissalDate = (row) =>
  parseExcelDate(
    row["Уволен с датой"] ||
      row["УволенСДатой"] ||
      row["Дата увольнения"] ||
      row["ДатаУвольнения"] ||
      row.Уволен ||
      row.dismissed_at ||
      row.fired_at,
  );

const mapEmployeeImportRows = (rows = []) => {
  return rows.map((row) => {
    const { lastName, firstName, middleName } = resolveNameFields(row);
    const kig = resolveKig(row);
    const personalPhone = normalizePhone(row.ТелефонФЛ || row.phone);
    const workPhone = normalizePhone(row.ТелефонСлужебный || row.work_phone);
    const { department, isClosedBrigade } = resolveDepartmentInfo(row);
    const dismissalDate = resolveDismissalDate(row);

    return {
      idAll: normalizeValue(row["Физлицо_id_all"] || row.id_all),
      counterpartyInn: normalizeValue(
        row["ИНН организации"] || row.inn_organization,
      ),
      counterpartyKpp: normalizeValue(
        row["КПП организации"] || row.kpp_organization,
      ),
      lastName,
      firstName,
      middleName,
      inn: normalizeValue(
        row["ИНН сотрудника"] || row.ИНН || row.employee_inn || row.inn,
      ),
      snils: normalizeValue(
        row.СНИЛС ||
          row["СтраховойНомерПФР"] ||
          row.snils ||
          row.snils_number,
      ),
      kig: normalizeValue(kig),
      kigEndDate: parseExcelDate(row["Срок окончания КИГ"] || row.kig_end_date),
      citizenship: normalizeValue(row.Гражданство || row.citizenship),
      birthDate: parseExcelDate(
        row["Дата рождения"] || row.ДатаРождения || row.birth_date,
      ),
      position: normalizeValue(row.Должность || row.position),
      department,
      isClosedBrigade,
      employmentStatus: resolveEmploymentStatus(
        row,
        isClosedBrigade,
        dismissalDate,
      ),
      dismissalDate,
      organization: normalizeValue(row.Организация || row.organization),
      phone: workPhone || personalPhone,
      personalPhone,
      workPhone,
      bankAccountNumber: normalizeValue(
        row["л/с"] ||
          row["Л/С"] ||
          row["лс"] ||
          row["ЛС"] ||
          row["Лицевой счет"] ||
          row["ЛицевойСчет"] ||
          row.bank_account_number,
      ),
      passportType: resolvePassportType(row),
      passportNumber: resolvePassportNumber(row),
      passportDate: parseExcelDate(row["Паспорт_ДатаВыдачи"] || row.passport_date),
      passportIssuer: normalizeValue(
        row["Паспорт_КемВыдан"] || row.passport_issuer,
      ),
      passportExpiryDate: parseExcelDate(
        row["Паспорт_ФМС_ДокументСрокДействия"] || row.passport_expiry_date,
      ),
      registrationAddress: normalizeValue(
        row.АдресПоПрописке || row.registration_address,
      ),
      patentIssueDate: parseExcelDate(
        row["Патент_ДатаВыдачи"] || row.patent_issue_date,
      ),
      patentNumber: normalizeValue(row["Патент_Номер"] || row.patent_number),
      blankNumber: normalizeValue(row["Патент_Серия"] || row.blank_number),
      passNumber: normalizeValue(
        row.НомерПропуска || row["Номер пропуска"] || row.passNumber || row.pass_number,
      ),
    };
  });
};

export const readEmployeesFromExcelFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
          raw: false,
        });
        resolve(mapEmployeeImportRows(rawData));
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("FileReader failed"));
    };

    reader.readAsBinaryString(file);
  });
