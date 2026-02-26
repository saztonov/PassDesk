import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Modal, Form, App, Tabs } from "antd";
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
import { formatEmployeeFormPayload } from "@/modules/employees/lib/employeeFormPayload";

const EmployeeFormModal = ({
  visible,
  employee,
  onCancel,
  onSuccess,
  onCheckInn,
}) => {
  const { message } = App.useApp();
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

  const handleCitizenshipChange = useCallback(
    (citizenshipId) => {
      updateSelectedCitizenship(citizenshipId);
      // Валидация запустится автоматически через handleFieldsChange
    },
    [updateSelectedCitizenship],
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
  const handleModalCancel = () => {
    onCancel();
  };

  const tabsItems = useEmployeeFormModalTabs({
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
    ensureEmployeeId,
    tabsValidation,
    documentProfilesConfig: settings?.employeeDocumentProfiles || null,
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

  // Модальное окно
  return (
    <>
      <Modal
        title={employee ? "Редактировать сотрудника" : "Добавить сотрудника"}
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
