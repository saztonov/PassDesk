import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Modal, Form, App, Tabs, Alert, Space, Grid, Typography } from "antd";
import dayjs from "dayjs";
import {
  capitalizeFirstLetter,
  filterCyrillicOnly,
} from "../../utils/formatters";
import {
  createAntiAutofillIds,
  formatBlankNumber,
  formatInn,
  formatKig,
  formatPassportDepartmentCode,
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
const PAGE_DOCS_MIN_WIDTH = 420;
const PAGE_DOCS_MAX_WIDTH = 960;
const PAGE_FORM_MIN_WIDTH = 560;
const PAGE_FORM_COMPACT_WIDTH = 860;
const OCR_APPLY_DATE_FIELDS = new Set([
  "birthDate",
  "passportDate",
  "passportExpiryDate",
  "kigEndDate",
  "patentIssueDate",
  "insurancePolicyDate",
]);

const EmployeeFormModal = ({
  visible,
  employee,
  onCancel,
  onSuccess,
  onCheckInn,
  mode = "modal",
  externalCloseRequestToken = 0,
  isExistingSession = Boolean(employee?.id),
}) => {
  const { message, modal } = App.useApp();
  const screens = useBreakpoint();
  const [form] = Form.useForm();
  const watchedCitizenshipId = Form.useWatch("citizenshipId", form);
  const watchedCounterpartyId = Form.useWatch("counterpartyId", form);
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
  const [pageDocsWidth, setPageDocsWidth] = useState(560);
  const [isResizingPageLayout, setIsResizingPageLayout] = useState(false);
  const pageSplitContainerRef = useRef(null);
  const pageFormPanelRef = useRef(null);
  const [pageFormWidth, setPageFormWidth] = useState(0);
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
    onAutofillApplied: (autoFillPatch, nextValues) => {
      const hasPassportType = Object.prototype.hasOwnProperty.call(
        autoFillPatch || {},
        "passportType",
      );
      if (!hasPassportType) {
        return;
      }

      const nextPassportType =
        nextValues?.passportType ?? autoFillPatch?.passportType ?? null;
      setPassportType(nextPassportType || null);
    },
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
    formatPassportDepartmentCode,
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

  const handleOcrConflictsChanged = useCallback(
    async (targetEmployeeId = employee?.id, options = {}) => {
      const summary = await refreshConflictSummary(targetEmployeeId);
      const appliedPatch =
        options?.action === "apply" &&
        options?.appliedPatch &&
        typeof options.appliedPatch === "object"
          ? options.appliedPatch
          : null;

      if (appliedPatch) {
        const formPatch = Object.entries(appliedPatch).reduce(
          (accumulator, [fieldName, value]) => {
            accumulator[fieldName] =
              OCR_APPLY_DATE_FIELDS.has(fieldName) && value ? dayjs(value) : value;
            return accumulator;
          },
          {},
        );

        form.setFieldsValue(formPatch);

        if (Object.prototype.hasOwnProperty.call(formPatch, "citizenshipId")) {
          updateSelectedCitizenship(formPatch.citizenshipId || null);
        }

        if (Object.prototype.hasOwnProperty.call(formPatch, "passportType")) {
          setPassportType(formPatch.passportType || null);
        }
      }

      return summary;
    },
    [employee?.id, form, refreshConflictSummary, setPassportType, updateSelectedCitizenship],
  );

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

  const compactPageFormLayout =
    mode === "page" &&
    screens.xl &&
    pageFormWidth > 0 &&
    pageFormWidth < PAGE_FORM_COMPACT_WIDTH;
  const canSelectCounterparty =
    user?.role === "admin" || user?.role === "manager";

  const handleFilesChange = useCallback(() => {}, []);
  const formatEmployeeFormPayloadWithRole = useCallback(
    (values, options = {}) =>
      formatEmployeeFormPayload(values, {
        ...options,
        includeCounterpartyId: canSelectCounterparty,
      }),
    [canSelectCounterparty],
  );

  const {
    isFormResetRef,
    handleSave,
    handleSaveDraft,
    ensureEmployeeId,
    scheduleAutoSaveDraft,
    discardIfAutoCreated,
    shouldPromptDraftOnClose,
    saveDraftBeforeClose,
    discardDraftOnClose,
    registerTouchedFields,
  } = useEmployeeFormSaveHandlers({
    form,
    visible,
    employee,
    isExistingSession,
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
    formatEmployeeFormPayload: formatEmployeeFormPayloadWithRole,
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
    registerTouchedFields,
    filterCyrillicOnly,
    capitalizeFirstLetter,
  });

  // Обработчик закрытия модального окна
  const handleModalCancel = useCallback(async () => {
    if (!shouldPromptDraftOnClose()) {
      await discardIfAutoCreated();
      onCancel();
      return;
    }

    modal.confirm({
      title: "Сохранить введенные значения?",
      content:
        "Да — сохранить черновик и продолжить позже. Нет — удалить черновик и временные файлы.",
      okText: "Да",
      cancelText: "Нет",
      closable: false,
      keyboard: false,
      maskClosable: false,
      centered: true,
      onOk: async () => {
        const savedDraft = await saveDraftBeforeClose();
        if (!savedDraft?.id && !employee?.id) {
          message.error("Не удалось сохранить черновик сотрудника");
          throw new Error("close-aborted");
        }
        onCancel({ skipDraftCleanup: true, preserveDraft: true });
      },
      onCancel: async () => {
        try {
          await discardDraftOnClose();
          await discardIfAutoCreated();
          onCancel({ skipDraftCleanup: true });
        } catch (error) {
          console.error("Failed to discard draft employee on close:", error);
          message.error("Не удалось удалить черновик сотрудника");
        }
      },
    });
  }, [
    discardDraftOnClose,
    discardIfAutoCreated,
    employee?.id,
    message,
    modal,
    onCancel,
    saveDraftBeforeClose,
    shouldPromptDraftOnClose,
  ]);

  useEffect(() => {
    if (mode !== "page" || externalCloseRequestToken <= 0) {
      return;
    }
    void handleModalCancel();
  }, [externalCloseRequestToken, handleModalCancel, mode]);

  const tabsItems = useEmployeeFormModalTabs({
    form,
    employee,
    selectedCitizenship,
    selectedCitizenshipId: watchedCitizenshipId,
    selectedCounterpartyId: watchedCounterpartyId,
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
    onOcrConflictsChanged: handleOcrConflictsChanged,
    includeFilesTab: mode !== "page",
    compactLayout: compactPageFormLayout,
  });

  // Контент формы
  const formContent = (
    <>
      <style>{`
        .employee-form-modal-body {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .employee-form-modal-tabs.ant-tabs {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        .employee-form-modal-tabs .ant-tabs-content-holder {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .employee-form-modal-tabs .ant-tabs-content {
          height: 100%;
        }
        .employee-form-modal-tabs .ant-tabs-tabpane {
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 4px;
        }
      `}</style>
      <BrowserAutofillTrap />
      <Form
        form={form}
        className="employee-form-modal-body"
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
          style={{ marginTop: 16, minHeight: 0 }}
          className="employee-form-modal-tabs"
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

  useEffect(() => {
    if (!screens.xl) {
      setIsResizingPageLayout(false);
    }
  }, [screens.xl]);

  useEffect(() => {
    if (!isResizingPageLayout || !screens.xl) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      const container = pageSplitContainerRef.current;
      if (!container) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      const maxAllowedWidth = Math.max(
        PAGE_DOCS_MIN_WIDTH,
        Math.min(PAGE_DOCS_MAX_WIDTH, bounds.width - PAGE_FORM_MIN_WIDTH),
      );
      const nextWidth = bounds.right - event.clientX - 12;

      setPageDocsWidth(
        Math.min(maxAllowedWidth, Math.max(PAGE_DOCS_MIN_WIDTH, nextWidth)),
      );
    };

    const handleMouseUp = () => {
      setIsResizingPageLayout(false);
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingPageLayout, screens.xl]);

  useEffect(() => {
    const node = pageFormPanelRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setPageFormWidth(entry.contentRect.width);
    });

    observer.observe(node);
    setPageFormWidth(node.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [mode, screens.xl]);

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
          ref={pageSplitContainerRef}
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
            ref={pageFormPanelRef}
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

          {screens.xl ? (
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => setIsResizingPageLayout(true)}
              style={{
                width: 12,
                cursor: "col-resize",
                alignSelf: "stretch",
                flex: "0 0 12px",
                order: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 4,
                  height: "100%",
                  borderRadius: 999,
                  background: isResizingPageLayout ? "#1677ff" : "#f0f0f0",
                  transition: "background 0.2s ease",
                }}
              />
            </div>
          ) : null}

          <div
            style={{
              flex: screens.xl ? `0 0 ${pageDocsWidth}px` : "1 1 auto",
              minWidth: 0,
              order: screens.xl ? 3 : 2,
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
                overflow: "hidden",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 8,
                  flexShrink: 0,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: 600, color: "#595959" }}>Документы</Text>
                {employee ? <EmployeeAuditInfoTooltip employee={employee} /> : null}
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                <EmployeeFilesTab
                  employee={employee}
                  selectedCitizenship={selectedCitizenship}
                  selectedCitizenshipId={watchedCitizenshipId}
                  selectedCounterpartyId={watchedCounterpartyId}
                  defaultCounterpartyId={defaultCounterpartyId}
                  userCounterpartyId={user?.counterpartyId || null}
                  onFilesUpdated={handleFilesChange}
                  onUploadComplete={handleUploadedFileForOcr}
                  ensureEmployeeId={ensureEmployeeId}
                  documentProfilesConfig={settings?.employeeDocumentProfiles || null}
                  viewerMode="inline"
                  columnsCount={1}
                  showInfoBanner={false}
                  embeddedViewerHeight="fill"
                  compact
                />
              </div>
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
          content: {
            height: "80vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
          body: {
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
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
