import {
  resolveEmployeeCounterpartyId,
  resolveEmployeeDocumentProfile,
} from "@/modules/employees/lib/documentTypeProfiles";
import DocumentTypeUploader from "./DocumentTypeUploader.jsx";

const EmployeeFilesTab = ({
  employee,
  defaultCounterpartyId,
  selectedCitizenship,
  selectedCitizenshipId,
  selectedCounterpartyId,
  userCounterpartyId,
  onFilesUpdated,
  onUploadComplete,
  onRerunOcr,
  onOcrActivityChange,
  ocrProcessingMap,
  ensureEmployeeId,
  documentProfilesConfig,
  hasResidencePermit = false,
  viewerMode,
  columnsCount,
  showInfoBanner,
  embeddedViewerHeight,
  compact,
  readonly = false,
}) => {
  const counterpartyId = resolveEmployeeCounterpartyId({
    employee: selectedCounterpartyId
      ? {
          ...employee,
          counterpartyId: selectedCounterpartyId,
          employeeCounterpartyMappings: [],
        }
      : employee,
    fallbackCounterpartyId: selectedCounterpartyId || userCounterpartyId,
  });

  const effectiveCitizenship =
    selectedCitizenshipId === undefined
      ? selectedCitizenship || employee?.citizenship || null
      : selectedCitizenshipId
        ? selectedCitizenship ||
          (employee?.citizenship?.id === selectedCitizenshipId
            ? employee.citizenship
            : null)
        : null;

  const profileCode = resolveEmployeeDocumentProfile({
    counterpartyId,
    defaultCounterpartyId,
    citizenship: effectiveCitizenship,
  });

  return (
    <DocumentTypeUploader
      employeeId={employee?.id}
      ensureEmployeeId={ensureEmployeeId}
      readonly={readonly}
      onFilesUpdated={onFilesUpdated}
      onUploadComplete={onUploadComplete}
      onRerunOcr={onRerunOcr}
      onOcrActivityChange={onOcrActivityChange}
      ocrProcessingMap={ocrProcessingMap}
      profileCode={profileCode}
      profilesConfig={documentProfilesConfig}
      hasResidencePermit={hasResidencePermit}
      viewerMode={viewerMode}
      columnsCount={columnsCount}
      showInfoBanner={showInfoBanner}
      embeddedViewerHeight={embeddedViewerHeight}
      compact={compact}
    />
  );
};

export default EmployeeFilesTab;
