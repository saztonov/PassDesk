import { buildMobileEmployeePersonalSection } from "@/modules/employees/ui/form/MobileEmployeePersonalSection";
import { buildMobileEmployeeStatusSection } from "@/modules/employees/ui/form/MobileEmployeeStatusSection";

export const buildMobilePrimarySections = ({
  employee,
  user,
  defaultCounterpartyId,
  fireLoading,
  activateLoading,
  onFire,
  onReinstate,
  onDeactivate,
  onActivate,
  getFieldProps,
  noAutoFillProps,
  latinInputError,
  antiAutofillIds,
  handleFullNameChange,
  loadingReferences,
  positions,
  citizenships,
  handleCitizenshipChange,
  formatPhoneNumber,
}) => {
  const sections = [];

  const statusSection = buildMobileEmployeeStatusSection({
    employee,
    user,
    defaultCounterpartyId,
    fireLoading,
    activateLoading,
    onFire,
    onReinstate,
    onDeactivate,
    onActivate,
  });

  if (statusSection) {
    sections.push(statusSection);
  }

  sections.push(
    buildMobileEmployeePersonalSection({
      getFieldProps,
      noAutoFillProps,
      latinInputError,
      antiAutofillIds,
      handleFullNameChange,
      loadingReferences,
      positions,
      citizenships,
      handleCitizenshipChange,
      formatPhoneNumber,
    }),
  );

  return sections;
};
