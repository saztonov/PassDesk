import {
  resolveEmployeeCounterpartyId,
  resolveEmployeeDocumentProfile,
} from "@/modules/employees/lib/documentTypeProfiles";
import DocumentTypeUploader from "./DocumentTypeUploader.jsx";

const CONSENT_DOCUMENT_TYPES = [
  "consent",
  "biometric_consent",
  "biometric_consent_developer",
];

const EmployeeFilesTab = ({
  employee,
  defaultCounterpartyId,
  selectedCitizenship,
  userCounterpartyId,
  onFilesUpdated,
  ensureEmployeeId,
}) => {
  const counterpartyId = resolveEmployeeCounterpartyId({
    employee,
    fallbackCounterpartyId: userCounterpartyId,
  });

  const profileCode = resolveEmployeeDocumentProfile({
    counterpartyId,
    defaultCounterpartyId,
    citizenship: selectedCitizenship || employee?.citizenship || null,
  });
  const consentOnlyProfilesConfig = {
    external: [...CONSENT_DOCUMENT_TYPES],
    default_ru_by: [...CONSENT_DOCUMENT_TYPES],
    default_foreign: [...CONSENT_DOCUMENT_TYPES],
  };

  return (
    <DocumentTypeUploader
      employeeId={employee?.id}
      ensureEmployeeId={ensureEmployeeId}
      readonly={false}
      onFilesUpdated={onFilesUpdated}
      profileCode={profileCode}
      profilesConfig={consentOnlyProfilesConfig}
    />
  );
};

export default EmployeeFilesTab;
