import { buildMobileEmployeeCounterpartySection } from "@/modules/employees/ui/form/MobileEmployeeCounterpartySection";
import { buildMobileEmployeeDocumentsSection } from "@/modules/employees/ui/form/MobileEmployeeDocumentsSection";
import { buildMobileEmployeePatentSection } from "@/modules/employees/ui/form/MobileEmployeePatentSection";

export const buildMobileDocumentSections = ({
  getFieldProps,
  requiresPatent,
  formatSnils,
  formatBankAccountNumber,
  formatKig,
  passportType,
  setPassportType,
  formatRussianPassportNumber,
  documentProfileCode,
  documentProfilesConfig,
  noAutoFillProps,
  employee,
  ensureEmployeeId,
  formatPatentNumber,
  formatBlankNumber,
  loadingCounterparties,
  availableCounterparties,
}) => {
  const showCounterpartySection = false;
  const sections = [];

  sections.push(
    buildMobileEmployeeDocumentsSection({
      getFieldProps,
      formatSnils,
      formatBankAccountNumber,
      passportType,
      setPassportType,
      formatRussianPassportNumber,
      profileCode: documentProfileCode,
      profilesConfig: documentProfilesConfig,
      noAutoFillProps,
      employee,
      ensureEmployeeId,
    }),
  );

  const patentSection = buildMobileEmployeePatentSection({
    requiresPatent,
    getFieldProps,
    formatKig,
    formatPatentNumber,
    noAutoFillProps,
    formatBlankNumber,
  });

  if (patentSection) {
    sections.push(patentSection);
  }

  if (showCounterpartySection) {
    sections.push(
      buildMobileEmployeeCounterpartySection({
        loadingCounterparties,
        availableCounterparties,
      }),
    );
  }

  return sections;
};
