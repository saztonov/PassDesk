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
      readonly={false}
      onFilesUpdated={onFilesUpdated}
      profileCode={profileCode}
      profilesConfig={documentProfilesConfig}
    />
  );
};

export default EmployeeFilesTab;
