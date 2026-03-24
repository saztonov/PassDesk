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
  viewerMode,
  columnsCount,
  showInfoBanner,
  embeddedViewerHeight,
  compact,
  readonly = false,
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
      readonly={readonly}
      onFilesUpdated={onFilesUpdated}
      onUploadComplete={onUploadComplete}
      profileCode={profileCode}
      profilesConfig={documentProfilesConfig}
      viewerMode={viewerMode}
      columnsCount={columnsCount}
      showInfoBanner={showInfoBanner}
      embeddedViewerHeight={embeddedViewerHeight}
      compact={compact}
    />
  );
};

export default EmployeeFilesTab;
