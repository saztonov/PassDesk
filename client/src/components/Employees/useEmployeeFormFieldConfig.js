import { useCallback, useEffect, useState } from "react";
import { DEFAULT_FORM_CONFIG } from "../../shared/config/employeeFields";

const TEMP_HIDDEN_FIELDS = new Set([
  "birthCountryId",
  "passportType",
  "passportExpiryDate",
  "gender",
  "email",
]);

export const useEmployeeFormFieldConfig = ({
  userCounterpartyId,
  defaultCounterpartyId,
  formConfigDefault,
  formConfigExternal,
}) => {
  const [activeConfig, setActiveConfig] = useState(DEFAULT_FORM_CONFIG);

  useEffect(() => {
    const isDefault = userCounterpartyId === defaultCounterpartyId;
    const config = isDefault
      ? formConfigDefault || DEFAULT_FORM_CONFIG
      : formConfigExternal || DEFAULT_FORM_CONFIG;
    setActiveConfig(config);
  }, [
    defaultCounterpartyId,
    formConfigDefault,
    formConfigExternal,
    userCounterpartyId,
  ]);

  const getFieldProps = useCallback(
    (fieldName) => {
      if (TEMP_HIDDEN_FIELDS.has(fieldName)) {
        return {
          hidden: true,
          required: false,
          rules: [],
        };
      }

      const fieldConfig = activeConfig[fieldName] || {
        visible: true,
        required: false,
      };

      const rules = [];
      if (fieldConfig.required) {
        rules.push({ required: true, message: "Заполните поле" });
      }

      return {
        hidden: !fieldConfig.visible,
        required: fieldConfig.required,
        rules,
      };
    },
    [activeConfig],
  );

  return {
    getFieldProps,
  };
};
