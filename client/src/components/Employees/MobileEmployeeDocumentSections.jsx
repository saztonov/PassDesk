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
  formatBankBik,
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
  onDocumentUploaded,
  canSelectCounterparty = false,
  hasResidencePermit,
}) => {
  const showCounterpartySection = canSelectCounterparty;
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
    onDocumentUploadComplete: onDocumentUploaded,
    profileCode: documentProfileCode,
    profilesConfig: documentProfilesConfig,
    hasResidencePermit,
  });

  const documentsSection = buildMobileEmployeeDocumentsSection({
    getFieldProps,
    formatInn,
    handleInnBlur,
    formatSnils,
    formatBankAccountNumber,
    formatBankBik,
    profileCode: documentProfileCode,
    profilesConfig: documentProfilesConfig,
    noAutoFillProps,
    employee,
    ensureEmployeeId,
    onDocumentUploadComplete: onDocumentUploaded,
    patentFields: patentSection?.children || null,
    hasResidencePermit,
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
