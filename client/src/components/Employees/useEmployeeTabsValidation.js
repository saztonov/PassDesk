import { useCallback, useMemo } from "react";

const doesCitizenshipRequirePatent = (citizenship) =>
  citizenship?.requiresPatent !== false && citizenship?.isEaeu !== true;

const getRequiredFieldsByTab = (
  getFieldProps,
  requiresPatent,
  passportType,
) => {
  const allFields = {
    1: [
      "inn",
      "lastName",
      "firstName",
      "middleName",
      "gender",
      "positionId",
      "citizenshipId",
      "birthDate",
      "registrationAddress",
      "email",
      "phone",
      "bankAccountNumber",
      "bankBik",
      "notes",
      "snils",
      "passportType",
      "passportNumber",
      "passportDate",
      "passportIssuer",
      "passportExpiryDate",
      "kig",
      "kigEndDate",
      "patentNumber",
      "patentIssueDate",
      "blankNumber",
    ],
  };

  const requiredFields = {};

  Object.keys(allFields).forEach((tabKey) => {
    requiredFields[tabKey] = allFields[tabKey].filter((fieldName) => {
      const props = getFieldProps(fieldName);

      if (props.hidden || !props.required) {
        return false;
      }

      if (
        ["kig", "kigEndDate", "patentNumber", "patentIssueDate", "blankNumber"].includes(fieldName)
      ) {
        if (!requiresPatent) return false;
      }

      if (fieldName === "passportExpiryDate") {
        if (passportType !== "foreign") return false;
      }

      return true;
    });
  });

  return requiredFields;
};

const useEmployeeTabsValidation = ({
  form,
  getFieldProps,
  passportType,
  selectedCitizenship,
}) => {
  const requiresPatent = doesCitizenshipRequirePatent(selectedCitizenship);

  const requiredFieldsByTab = useMemo(
    () => getRequiredFieldsByTab(getFieldProps, requiresPatent, passportType),
    [getFieldProps, requiresPatent, passportType],
  );

  const computeValidation = useCallback(
    (citizenshipOverride = null) => {
      const values = form.getFieldsValue(true);
      const validation = {};

      const currentCitizenship = citizenshipOverride || selectedCitizenship;
      const currentRequiresPatent =
        doesCitizenshipRequirePatent(currentCitizenship);
      const currentPassportType = values.passportType || passportType;

      const currentRequiredFieldsByTab = getRequiredFieldsByTab(
        getFieldProps,
        currentRequiresPatent,
        currentPassportType,
      );

      Object.entries(currentRequiredFieldsByTab).forEach(([tabKey, fields]) => {
        if (!fields) {
          validation[tabKey] = true;
          return;
        }

        const fieldsStatus = fields.map((field) => {
          const value = values[field];
          const isValid = Array.isArray(value)
            ? value.length > 0
            : value !== undefined && value !== null && value !== "";

          return { field, value, isValid };
        });

        validation[tabKey] = fieldsStatus.every((f) => f.isValid);
      });

      return validation;
    },
    [form, getFieldProps, passportType, selectedCitizenship],
  );

  return { requiredFieldsByTab, computeValidation, requiresPatent };
};

export default useEmployeeTabsValidation;
