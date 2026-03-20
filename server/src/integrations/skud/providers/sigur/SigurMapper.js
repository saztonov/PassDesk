const trim = (value) => String(value || "").trim();

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

  return {
    ...(externalEmpId ? { id: Number.parseInt(String(externalEmpId), 10) || undefined } : {}),
    name,
    description: trim(counterpartyName) || trim(employee?.notes) || "",
    ...(departmentId ? { departmentId: Number.parseInt(String(departmentId), 10) || undefined } : {}),
    accessStartTime: resolvedAccessStart,
    accessEndTime: resolvedAccessEnd,
    verificationPin: trim(employee?.verificationPin) || undefined,
    tabId: trim(employee?.inn) || undefined,
  };
};

export const mapCardToSigur = ({ cardNumber, cardType = "rfid" }) => ({
  name: trim(cardNumber),
  value: trim(cardNumber),
  format: "UID",
});
