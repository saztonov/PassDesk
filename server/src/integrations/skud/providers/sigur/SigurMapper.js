const trim = (value) => String(value || "").trim();
const W26_CARD_RE = /^\d+\s*,\s*\d+$/;

const parseW26FormattedValue = (value) => {
  const match = trim(value).match(/^(\d+)\s*,\s*(\d+)$/);
  if (!match) {
    return null;
  }

  const facilityCode = Number.parseInt(match[1], 10);
  const cardNumber = Number.parseInt(match[2], 10);
  if (
    !Number.isInteger(facilityCode)
    || !Number.isInteger(cardNumber)
    || facilityCode < 0
    || facilityCode > 255
    || cardNumber < 0
    || cardNumber > 65535
  ) {
    return null;
  }

  return {
    facilityCode,
    cardNumber,
    formattedValue: `${facilityCode},${cardNumber}`,
  };
};

export const convertW26ToSigurValue = (value) => {
  const parsed = parseW26FormattedValue(value);
  if (!parsed) {
    return null;
  }

  return parsed.facilityCode.toString(16).padStart(2, "0").toUpperCase()
    + parsed.cardNumber.toString(16).padStart(4, "0").toUpperCase();
};

const buildFullName = (employee) =>
  [trim(employee?.lastName), trim(employee?.firstName), trim(employee?.middleName)]
    .filter(Boolean)
    .join(" ")
    .trim();

// Sentinel для явной передачи null (сброс значения в Sigur)
export const SIGUR_RESET = null;

export const mapEmployeeToSigur = ({
  employee,
  externalEmpId = null,
  counterpartyName = "",
  departmentId = null,
  positionId = null,
  positionName = undefined,
  accessStartTime = undefined,
  accessEndTime = undefined,
}) => {
  const name = buildFullName(employee) || trim(employee?.firstName) || "Сотрудник";

  // Если явно передан null — сбрасываем поле (null → Sigur сбросит ограничение)
  // Если undefined — берём из employee или дефолт
  const resolvedAccessStart =
    accessStartTime !== undefined
      ? accessStartTime
      : (employee?.accessStartTime || employee?.createdAt || undefined);

  const resolvedAccessEnd =
    accessEndTime !== undefined
      ? accessEndTime
      : (employee?.accessEndTime || undefined);

  const resolvedPositionName =
    positionName !== undefined ? trim(positionName) || undefined : trim(employee?.position?.name) || undefined;
  const resolvedPositionId = Number.parseInt(String(positionId), 10) || undefined;

  return {
    ...(externalEmpId ? { id: Number.parseInt(String(externalEmpId), 10) || undefined } : {}),
    name,
    description: trim(counterpartyName) || trim(employee?.notes) || "",
    ...(departmentId ? { departmentId: Number.parseInt(String(departmentId), 10) || undefined } : {}),
    ...(resolvedPositionId ? { positionId: resolvedPositionId } : {}),
    accessStartTime: resolvedAccessStart,
    accessEndTime: resolvedAccessEnd,
    verificationPin: trim(employee?.verificationPin) || undefined,
    tabId: trim(employee?.inn) || undefined,
    ...(resolvedPositionName ? { positionName: resolvedPositionName } : {}),
  };
};

export const mapCardToSigur = ({ cardNumber, cardType = "rfid" }) => {
  const normalizedCardNumber = trim(cardNumber).replace(/\s+/g, "");
  const format = W26_CARD_RE.test(normalizedCardNumber) ? "W26" : "UID";
  const sigurValue = format === "W26"
    ? convertW26ToSigurValue(normalizedCardNumber) || normalizedCardNumber
    : normalizedCardNumber;

  return {
    name: normalizedCardNumber,
    value: sigurValue,
    format,
  };
};
