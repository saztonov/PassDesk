import { buildMobileEmployeePersonalSection } from "@/modules/employees/ui/form/MobileEmployeePersonalSection";
import { buildMobileEmployeeStatusSection } from "@/modules/employees/ui/form/MobileEmployeeStatusSection";

export const buildMobilePrimarySections = ({
  employee,
  ensureEmployeeId,
  documentProfileCode,
  documentProfilesConfig,
  user,
  defaultCounterpartyId,
  fireLoading,
  activateLoading,
  onFire,
  onReinstate,
  onDeactivate,
  onActivate,
  getFieldProps,
  handleLastNameBlur,
  noAutoFillProps,
  latinInputError,
  antiAutofillIds,
  handleFullNameChange,
  loadingReferences,
  citizenships,
  handleCitizenshipChange,
  formatPhoneNumber,
  onDocumentUploaded,
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
      handleLastNameBlur,
      noAutoFillProps,
      latinInputError,
      antiAutofillIds,
      handleFullNameChange,
      loadingReferences,
      citizenships,
      handleCitizenshipChange,
      formatPhoneNumber,
      employee,
      ensureEmployeeId,
      onDocumentUploadComplete: onDocumentUploaded,
      profileCode: documentProfileCode,
      profilesConfig: documentProfilesConfig,
    }),
  );

  return sections;
};
