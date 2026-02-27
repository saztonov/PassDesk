import {
  resolveEmployeeCounterpartyId,
  resolveEmployeeDocumentProfile,
} from "@/modules/employees/lib/documentTypeProfiles";
import DocumentTypeUploader from "./DocumentTypeUploader.jsx";

const EmployeeFilesTab = ({
  employee,
  defaultCounterpartyId,
  selectedCitizenship,
  userCounterpartyId,
  onFilesUpdated,
  onUploadComplete,
  ensureEmployeeId,
  documentProfilesConfig,
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

  return (
    <DocumentTypeUploader
      employeeId={employee?.id}
      ensureEmployeeId={ensureEmployeeId}
      readonly={false}
      onFilesUpdated={onFilesUpdated}
      onUploadComplete={onUploadComplete}
      profileCode={profileCode}
      profilesConfig={documentProfilesConfig}
    />
  );
};

export default EmployeeFilesTab;
