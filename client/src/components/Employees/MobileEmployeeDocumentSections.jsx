import { buildMobileEmployeeCounterpartySection } from "@/modules/employees/ui/form/MobileEmployeeCounterpartySection";
import { buildMobileEmployeeDocumentsSection } from "@/modules/employees/ui/form/MobileEmployeeDocumentsSection";
import { buildMobileEmployeePatentSection } from "@/modules/employees/ui/form/MobileEmployeePatentSection";

export const buildMobileDocumentSections = ({
  getFieldProps,
  requiresPatent,
  formatSnils,
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
  const sections = [];

  sections.push(
    buildMobileEmployeeDocumentsSection({
      getFieldProps,
      formatSnils,
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
    formatPatentNumber,
    noAutoFillProps,
    formatBlankNumber,
  });

  if (patentSection) {
    sections.push(patentSection);
  }

  sections.push(
    buildMobileEmployeeCounterpartySection({
      loadingCounterparties,
      availableCounterparties,
    }),
  );

  return sections;
};
