const trim = (value) => String(value || "").trim();

const buildFullName = (employee) =>
  [trim(employee?.lastName), trim(employee?.firstName), trim(employee?.middleName)]
    .filter(Boolean)
    .join(" ")
    .trim();

export const mapEmployeeToSigur = ({
  employee,
  externalEmpId = null,
  counterpartyName = "",
  accessStartTime = null,
  accessEndTime = null,
}) => {
  const name = buildFullName(employee) || trim(employee?.firstName) || "Сотрудник";

  return {
    ...(externalEmpId ? { id: Number.parseInt(String(externalEmpId), 10) || undefined } : {}),
    name,
    description: trim(counterpartyName) || trim(employee?.notes) || "",
    accessStartTime:
      accessStartTime || employee?.accessStartTime || employee?.createdAt || undefined,
    accessEndTime: accessEndTime || employee?.accessEndTime || undefined,
    verificationPin: trim(employee?.verificationPin) || undefined,
    tabId: trim(employee?.inn) || undefined,
  };
};

export const mapCardToSigur = ({ cardNumber, cardType = "rfid" }) => ({
  name: trim(cardNumber),
  value: trim(cardNumber),
  format: cardType === "rfid" ? "W58DEC" : "W58DEC",
});
