import { buildMobileEmployeeCounterpartySection } from "@/modules/employees/ui/form/MobileEmployeeCounterpartySection";
import { buildMobileEmployeeDocumentsSection } from "@/modules/employees/ui/form/MobileEmployeeDocumentsSection";
import { buildMobileEmployeePatentSection } from "@/modules/employees/ui/form/MobileEmployeePatentSection";

export const buildMobileDocumentSections = ({
  getFieldProps,
  formatInn,
  handleInnBlur,
  requiresPatent,
  formatSnils,
  formatBankAccountNumber,
  formatKig,
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

  const patentSection = buildMobileEmployeePatentSection({
    requiresPatent,
    getFieldProps,
    formatKig,
    formatPatentNumber,
    noAutoFillProps,
    formatBlankNumber,
    employee,
    ensureEmployeeId,
    profileCode: documentProfileCode,
    profilesConfig: documentProfilesConfig,
  });

  const documentsSection = buildMobileEmployeeDocumentsSection({
    getFieldProps,
    formatInn,
    handleInnBlur,
    formatSnils,
    formatBankAccountNumber,
    profileCode: documentProfileCode,
    profilesConfig: documentProfilesConfig,
    noAutoFillProps,
    employee,
    ensureEmployeeId,
    patentFields: patentSection?.children || null,
  });

  sections.push(documentsSection);

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
