import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Modal, Form, App, Tabs, Alert, Space, Grid, Typography } from "antd";
import {
  capitalizeFirstLetter,
  filterCyrillicOnly,
} from "../../utils/formatters";
import {
  createAntiAutofillIds,
  formatBlankNumber,
  formatInn,
  formatKig,
  formatPatentNumber,
  formatPhoneNumber,
  formatSnils,
} from "./employeeFormUtils";
import { useAuthStore } from "../../store/authStore";
import { useReferencesStore } from "../../store/referencesStore";
import TransferEmployeeModal from "./TransferEmployeeModal.jsx";
import EmployeeFormModalFooter from "./EmployeeFormModalFooter.jsx";
import { useEmployeeFormModalTabs } from "./useEmployeeFormModalTabs";
import { useEmployeeFormFieldConfig } from "./useEmployeeFormFieldConfig";
import {
  applyLinkingModePayload,
  getInitialLinkingMode,
  shouldStayOpenAfterSave,
} from "./useEmployeeLinkingMode";
import useEmployeeReferences from "./useEmployeeReferences";
import useEmployeeTabsValidation from "./useEmployeeTabsValidation";
import { DATE_FORMAT } from "./employeeFormModalUtils";
import BrowserAutofillTrap from "@/modules/employees/ui/form/BrowserAutofillTrap";
import { useEmployeeFormInitialization } from "@/modules/employees/model/useEmployeeFormInitialization";
import { useEmployeeFormSaveHandlers } from "@/modules/employees/model/useEmployeeFormSaveHandlers";
import { useEmployeeFormInputHandlers } from "@/modules/employees/model/useEmployeeFormInputHandlers";
import { useEmployeeFormTabFlow } from "@/modules/employees/model/useEmployeeFormTabFlow";
import { useEmployeeOcrHandlers } from "@/modules/employees/model/useEmployeeOcrHandlers";
import { formatEmployeeFormPayload } from "@/modules/employees/lib/employeeFormPayload";
import OcrConflictSummaryNotice from "@/modules/employees/ui/OcrConflictSummaryNotice";
import EmployeeAuditInfoTooltip from "@/modules/employees/ui/EmployeeAuditInfoTooltip";
import EmployeeFilesTab from "./EmployeeFilesTab.jsx";

const { useBreakpoint } = Grid;
const { Text } = Typography;

const EmployeeFormModal = ({
  visible,
  employee,
  onCancel,
  onSuccess,
  onCheckInn,
  mode = "modal",
}) => {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const [form] = Form.useForm();
  const watchedCitizenshipId = Form.useWatch("citizenshipId", form);
  const antiAutofillIds = useMemo(() => createAntiAutofillIds(), []);
  const [citizenships, setCitizenships] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkingCitizenship, setCheckingCitizenship] = useState(false); // Флаг проверки гражданства
  const [dataLoaded, setDataLoaded] = useState(false); // Новый флаг: данные полностью загружены
  const [activeTab, setActiveTab] = useState("1");
  const [tabsValidation, setTabsValidation] = useState({
    1: false, // Личная информация
  });
  const [selectedCitizenship, setSelectedCitizenship] = useState(null);
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);
  const [passportType, setPassportType] = useState(null); // Состояние для типа паспорта
  const [linkingMode, setLinkingMode] = useState(false); // 🎯 Режим привязки существующего сотрудника
  const { user } = useAuthStore();
  const { formConfigDefault, formConfigExternal, settings } =
    useReferencesStore();
  const [transferModalVisible, setTransferModalVisible] = useState(false); // Модальное окно перевода сотрудника
  const [availableCounterparties, setAvailableCounterparties] = useState([]); // Доступные контрагенты
  const [loadingCounterparties, setLoadingCounterparties] = useState(false); // Загрузка контрагентов
  const {
    conflictSummary,
    handleUploadedFileForOcr,
    isOcrProcessing,
    refreshConflictSummary,
  } = useEmployeeOcrHandlers({
    form,
    citizenships,
    getPassportType: () =>
      form.getFieldValue("passportType") || passportType || employee?.passportType,
    messageApi: message,
    employeeId: employee?.id || null,
    visible,
  });

  const {
    fetchCitizenships,
    fetchPositions,
    fetchDefaultCounterparty,
    fetchCounterparties,
  } = useEmployeeReferences({
    setCitizenships,
    setPositions,
    setDefaultCounterpartyId,
    setAvailableCounterparties,
    setLoadingCounterparties,
  });

  const { getFieldProps } = useEmployeeFormFieldConfig({
    userCounterpartyId: user?.counterpartyId,
    defaultCounterpartyId,
    formConfigDefault,
    formConfigExternal,
  });

  const { requiredFieldsByTab, computeValidation, requiresPatent } =
    useEmployeeTabsValidation({
      form,
      getFieldProps,
      passportType,
      selectedCitizenship,
    });
  const computeValidationRef = useRef(computeValidation);

  useEffect(() => {
    computeValidationRef.current = computeValidation;
  }, [computeValidation]);

  const scheduleValidation = useCallback(() => {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => {
        const validation = computeValidation();
        setTabsValidation(validation);
      });
      return;
    }
    const validation = computeValidation();
    setTabsValidation(validation);
  }, [computeValidation]);

  useEmployeeFormInitialization({
    visible,
    employee,
    form,
    userCounterpartyId: user?.counterpartyId || null,
    defaultCounterpartyId,
    fetchCitizenships,
    fetchPositions,
    fetchDefaultCounterparty,
    fetchCounterparties,
    setLinkingMode,
    setDataLoaded,
    setActiveTab,
    setSelectedCitizenship,
    setCheckingCitizenship,
    setPassportType,
    setTabsValidation,
    computeValidationRef,
    getInitialLinkingMode,
    formatInn,
    formatSnils,
    formatPhoneNumber,
    formatKig,
    formatPatentNumber,
    formatBlankNumber,
  });

  const updateSelectedCitizenship = useCallback(
    (citizenshipId) => {
      const citizenship = citizenships.find((c) => c.id === citizenshipId);
      setSelectedCitizenship(citizenship || null);
    },
    [citizenships],
  );

  useEffect(() => {
    updateSelectedCitizenship(watchedCitizenshipId || null);
  }, [watchedCitizenshipId, updateSelectedCitizenship]);

  useEffect(() => {
    if (watchedCitizenshipId && !form.getFieldValue("birthCountryId")) {
      form.setFieldValue("birthCountryId", watchedCitizenshipId);
    }
  }, [form, watchedCitizenshipId]);

  useEffect(() => {
    if (activeTab === "ocr-conflicts" && !conflictSummary?.hasConflicts) {
      setActiveTab("1");
    }
  }, [activeTab, conflictSummary?.hasConflicts]);

  const handleCitizenshipChange = useCallback(
    (citizenshipId) => {
      updateSelectedCitizenship(citizenshipId);
      if (citizenshipId && !form.getFieldValue("birthCountryId")) {
        form.setFieldValue("birthCountryId", citizenshipId);
      }
      // Валидация запустится автоматически через handleFieldsChange
    },
    [form, updateSelectedCitizenship],
  );

  const { allTabsValid, handleNext } = useEmployeeFormTabFlow({
    requiresPatent,
    checkingCitizenship,
    activeTab,
    setActiveTab,
    visible,
    requiredFieldsByTab,
    tabsValidation,
  });

  const handleFilesChange = useCallback(() => {}, []);

  const {
    isFormResetRef,
    handleSave,
    handleSaveDraft,
    ensureEmployeeId,
    scheduleAutoSaveDraft,
    discardIfAutoCreated,
  } = useEmployeeFormSaveHandlers({
    form,
    visible,
    employee,
    onSuccess,
    onCancel,
    message,
    linkingMode,
    setLinkingMode,
    setLoading,
    setActiveTab,
    setTabsValidation,
    setSelectedCitizenship,
    setPassportType,
    applyLinkingModePayload,
    shouldStayOpenAfterSave,
    formatEmployeeFormPayload,
  });

  const {
    latinInputError,
    handleFieldsChange,
    handleInnBlur,
    handleFullNameChange,
  } = useEmployeeFormInputHandlers({
    form,
    employee,
    onCheckInn,
    message,
    dataLoaded,
    passportType,
    setPassportType,
    scheduleValidation,
    scheduleAutoSaveDraft,
    isFormResetRef,
    filterCyrillicOnly,
    capitalizeFirstLetter,
  });

  // Обработчик закрытия модального окна
  const handleModalCancel = useCallback(async () => {
    await discardIfAutoCreated();
    onCancel();
  }, [discardIfAutoCreated, onCancel]);

  const tabsItems = useEmployeeFormModalTabs({
    form,
    employee,
    selectedCitizenship,
    message,
    onCancel,
    user,
    defaultCounterpartyId,
    setTransferModalVisible,
    getFieldProps,
    positions,
    citizenships,
    handleCitizenshipChange,
    antiAutofillIds,
    latinInputError,
    handleFullNameChange,
    handleInnBlur,
    requiresPatent,
    checkingCitizenship,
    passportType,
    setPassportType,
    dateFormat: DATE_FORMAT,
    availableCounterparties,
    loadingCounterparties,
    handleFilesChange,
    onDocumentUploaded: handleUploadedFileForOcr,
    ensureEmployeeId,
    tabsValidation,
    documentProfilesConfig: settings?.employeeDocumentProfiles || null,
    conflictSummary,
    onOcrConflictsChanged: refreshConflictSummary,
    includeFilesTab: mode !== "page",
  });

  // Контент формы
  const formContent = (
    <>
      <BrowserAutofillTrap />
      <Form
        form={form}
        layout="vertical"
        initialValues={{ gender: "male" }}
        onFieldsChange={handleFieldsChange}
        validateTrigger={["onChange", "onBlur"]}
        autoComplete="off"
        requiredMark={(label, { required }) => (
          <>
            {label}
            {required && (
              <span style={{ color: "#ff4d4f", marginLeft: 4 }}>*</span>
            )}
          </>
        )}
      >
        {isOcrProcessing && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="OCR: распознаем документ..."
          />
        )}
        <OcrConflictSummaryNotice
          summary={conflictSummary}
          onOpen={() => setActiveTab("ocr-conflicts")}
        />
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            // Валидация запустится через useEffect при изменении activeTab
          }}
          style={{ marginTop: 16 }}
          destroyOnHidden={false} // Рендерим все вкладки сразу, чтобы форма видела все поля
          items={tabsItems}
        />
      </Form>
    </>
  );

  const footer = (
    <EmployeeFormModalFooter
      employee={employee}
      loading={loading}
      allTabsValid={allTabsValid}
      onCancel={handleModalCancel}
      onSaveDraft={handleSaveDraft}
      onSave={handleSave}
      onNext={handleNext}
      allowTabNavigation={false}
    />
  );

  const titleNode = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingRight: mode === "modal" ? 24 : 0,
      }}
    >
      <span>{employee ? "Редактировать сотрудника" : "Добавить сотрудника"}</span>
      {employee ? (
        <Space size={8}>
          <EmployeeAuditInfoTooltip employee={employee} />
        </Space>
      ) : null}
    </div>
  );

  const pageContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff",
        border: "1px solid #f0f0f0",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: screens.xl ? "row" : "column",
            gap: 24,
            alignItems: "stretch",
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              order: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                border: "1px solid #f0f0f0",
                borderRadius: 16,
                padding: 20,
                background: "#fff",
                height: "100%",
                overflowY: "auto",
                boxSizing: "border-box",
              }}
            >
              {formContent}
            </div>
          </div>

          <div
            style={{
              flex: screens.xxl ? "0 0 460px" : screens.xl ? "0 0 400px" : "1 1 auto",
              minWidth: 0,
              order: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                border: "1px solid #f0f0f0",
                borderRadius: 16,
                padding: 16,
                background: "#fff",
                height: "100%",
                overflowY: "auto",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Документы</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Просмотр и загрузка сканов
                  </Text>
                </div>
                {employee ? <EmployeeAuditInfoTooltip employee={employee} /> : null}
              </div>
              <EmployeeFilesTab
                employee={employee}
                selectedCitizenship={selectedCitizenship}
                defaultCounterpartyId={defaultCounterpartyId}
                userCounterpartyId={user?.counterpartyId || null}
                onFilesUpdated={handleFilesChange}
                onUploadComplete={handleUploadedFileForOcr}
                ensureEmployeeId={ensureEmployeeId}
                documentProfilesConfig={settings?.employeeDocumentProfiles || null}
                viewerMode="inline"
                columnsCount={1}
                showInfoBanner={false}
                embeddedViewerHeight={screens.xl ? 300 : 240}
                compact
              />
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "16px 24px",
          borderTop: "1px solid #f0f0f0",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        {footer}
      </div>
    </div>
  );

  if (mode === "page") {
    return (
      <>
        {pageContent}
        <TransferEmployeeModal
          visible={transferModalVisible}
          employee={employee}
          onCancel={() => setTransferModalVisible(false)}
        />
      </>
    );
  }

  return (
    <>
      <Modal
        title={titleNode}
        open={visible}
        onCancel={handleModalCancel}
        maskClosable={false}
        width={1350}
        footer={footer}
        styles={{
          body: { maxHeight: "70vh", overflowY: "auto", overflowX: "hidden" },
        }}
      >
        {formContent}
      </Modal>

      {/* Модальное окно перевода сотрудника в другую компанию */}
      <TransferEmployeeModal
        visible={transferModalVisible}
        employee={employee}
        onCancel={() => setTransferModalVisible(false)}
      />
    </>
  );
};

export default EmployeeFormModal;
