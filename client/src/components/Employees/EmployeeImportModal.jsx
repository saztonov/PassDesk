import { App, Button, Modal, Spin, Steps } from "antd";
import EmployeeImportStepUpload from "@/modules/employees/ui/import/EmployeeImportStepUpload";
import EmployeeImportStepPreview from "@/modules/employees/ui/import/EmployeeImportStepPreview";
import EmployeeImportStepConflicts from "@/modules/employees/ui/import/EmployeeImportStepConflicts";
import EmployeeImportStepReady from "@/modules/employees/ui/import/EmployeeImportStepReady";
import EmployeeImportStepResults from "@/modules/employees/ui/import/EmployeeImportStepResults";
import {
  EMPLOYEE_IMPORT_STEPS,
  useEmployeeImportFlow,
} from "@/modules/employees/model/useEmployeeImportFlow";

const EmployeeImportModal = ({
  visible,
  onCancel,
  onSuccess,
  profile = "default",
}) => {
  const { message: messageApp } = App.useApp();

  const {
    profileConfig,
    step,
    loading,
    fileData,
    fileName,
    validationResult,
    conflictResolutions,
    importResult,
    totalEmployees,
    handleCancel,
    handleFileSelect,
    handleNext,
    handlePrevious,
    handleConflictResolutionChange,
    handleResolveAllConflicts,
    nextButtonText,
    modalTitle,
  } = useEmployeeImportFlow({
    messageApi: messageApp,
    onCancel,
    onSuccess,
    profile,
  });

  let content = null;
  if (step === 0) {
    content = (
      <EmployeeImportStepUpload
        profileConfig={profileConfig}
        fileName={fileName}
        onFileSelect={handleFileSelect}
        onOpenTemplate={() =>
          profileConfig.templateUrl
            ? window.open(profileConfig.templateUrl, "_blank")
            : null
        }
      />
    );
  } else if (step === 1) {
    content = (
      <EmployeeImportStepPreview
        fileData={fileData || []}
        profile={profileConfig.id}
      />
    );
  } else if (step === 2) {
    content = (
      <EmployeeImportStepConflicts
        validationResult={validationResult}
        conflictResolutions={conflictResolutions}
        onConflictResolutionChange={handleConflictResolutionChange}
        onResolveAll={handleResolveAllConflicts}
      />
    );
  } else if (step === 3) {
    content = <EmployeeImportStepReady totalEmployees={totalEmployees} />;
  } else {
    content = <EmployeeImportStepResults importResult={importResult} />;
  }

  return (
    <Modal
      title={modalTitle}
      open={visible}
      onCancel={handleCancel}
      width="90vw"
      style={{ maxWidth: "95vw" }}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Отмена
        </Button>,
        step > 0 ? (
          <Button key="back" onClick={handlePrevious}>
            Назад
          </Button>
        ) : null,
        <Button
          key="next"
          type="primary"
          onClick={handleNext}
          loading={loading}
          disabled={(step === 0 && !fileData) || (step === 3 && loading)}
        >
          {nextButtonText}
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <Steps
          current={step}
          items={EMPLOYEE_IMPORT_STEPS}
          style={{ marginBottom: "24px" }}
        />
        {content}
      </Spin>
    </Modal>
  );
};

export default EmployeeImportModal;
