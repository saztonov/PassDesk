import { Form, Collapse, App } from "antd";
import { CaretRightOutlined } from "@ant-design/icons";
import { useMemo, useState, useRef, useCallback } from "react";
import { useEmployeeForm } from "./useEmployeeForm";
import {
  capitalizeFirstLetter,
  filterCyrillicOnly,
} from "../../utils/formatters";
import { useEmployeeStatusActions } from "@/modules/employees/model/useEmployeeStatusActions";
import { useMobileEmployeeFormInteractions } from "@/modules/employees/model/useMobileEmployeeFormInteractions";
import { useMobileEmployeeFormInitialization } from "@/modules/employees/model/useMobileEmployeeFormInitialization";
import { useMobileEmployeeCancelConfirm } from "@/modules/employees/model/useMobileEmployeeCancelConfirm";
import { useMobileEmployeeFormSections } from "./useMobileEmployeeFormSections";
import {
  resolveEmployeeCounterpartyId,
  resolveEmployeeDocumentProfile,
} from "@/modules/employees/lib/documentTypeProfiles";
import BrowserAutofillTrap from "@/modules/employees/ui/form/BrowserAutofillTrap";
import MobileEmployeeFormActions from "@/modules/employees/ui/form/MobileEmployeeFormActions";

// Общие пропсы для отключения автозаполнения браузера
const noAutoFillProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-form-type": "other",
  "data-lpignore": "true",
  onFocus: (e) => {
    if (e.target.hasAttribute("readonly")) {
      e.target.removeAttribute("readonly");
    }
  },
  onTouchStart: (e) => {
    if (e.target.hasAttribute("readonly")) {
      e.target.removeAttribute("readonly");
    }
  },
  readOnly: true, // Начинаем с readonly чтобы предотвратить автозаполнение
};

const createAntiAutofillIds = () => ({
  lastName: `employee_last_${Math.random().toString(36).slice(2, 9)}`,
  firstName: `employee_first_${Math.random().toString(36).slice(2, 9)}`,
  middleName: `employee_middle_${Math.random().toString(36).slice(2, 9)}`,
  phone: `employee_phone_${Math.random().toString(36).slice(2, 9)}`,
  registrationAddress: `employee_reg_addr_${Math.random().toString(36).slice(2, 9)}`,
});

/**
 * Мобильная форма сотрудника
 * Все поля в один столбец, блоки вместо вкладок
 */
const MobileEmployeeForm = ({ employee, onSuccess, onCancel, onCheckInn }) => {
  const { modal, message: messageApi } = App.useApp();
  const {
    form,
    loading,
    loadingReferences,
    citizenships,
    selectedCitizenship,
    requiresPatent,
    defaultCounterpartyId,
    documentProfilesConfig,
    user,
    handleCitizenshipChange,
    handleSave,
    handleSaveDraft,
    initializeEmployeeData,
    formatPhoneNumber,
    formatSnils,
    formatBankAccountNumber,
    formatKig,
    formatInn,
    formatPatentNumber,
    formatBlankNumber,
    getFieldProps,
  } = useEmployeeForm(employee, true, onSuccess);
  const antiAutofillIds = useMemo(() => createAntiAutofillIds(), []);

  // Состояние для открытых панелей (по умолчанию все открыны)
  const [activeKeys, setActiveKeys] = useState([
    "personal",
    "documents",
    "statuses",
  ]);
  const [employeeIdOnLoad, setEmployeeIdOnLoad] = useState(null); // Отслеживаем id сотрудника при загрузке
  const lastSavedSnapshotRef = useRef(null); // Снимок формы после последнего сохранения
  const [counterpartyState, setCounterpartyState] = useState({
    availableCounterparties: [],
    loadingCounterparties: false,
  });
  const { availableCounterparties, loadingCounterparties } = counterpartyState;
  const setAvailableCounterparties = useCallback((value) => {
    setCounterpartyState((prev) => ({
      ...prev,
      availableCounterparties:
        typeof value === "function"
          ? value(prev.availableCounterparties)
          : value,
    }));
  }, []);
  const setLoadingCounterparties = useCallback((value) => {
    setCounterpartyState((prev) => ({
      ...prev,
      loadingCounterparties:
        typeof value === "function" ? value(prev.loadingCounterparties) : value,
    }));
  }, []);

  const {
    fireLoading,
    activateLoading,
    handleFire,
    handleReinstate,
    handleDeactivate,
    handleActivate,
  } = useEmployeeStatusActions({
    employee,
    messageApi,
    onAfterAction: onCancel,
  });

  useMobileEmployeeFormInitialization({
    employee,
    employeeIdOnLoad,
    setEmployeeIdOnLoad,
    citizenshipsLength: citizenships.length,
    initializeEmployeeData,
    form,
    lastSavedSnapshotRef,
    handleCitizenshipChange,
    userCounterpartyId: user?.counterpartyId,
    setAvailableCounterparties,
    setLoadingCounterparties,
  });

  const {
    canSave,
    latinInputError,
    ensureEmployeeId,
    handleSaveWithReset,
    handleSaveDraftWithReset,
    handleInnBlur,
    handleLastNameBlur,
    handleFullNameChange,
    handleFormFieldsChange,
  } = useMobileEmployeeFormInteractions({
    form,
    employee,
    onCheckInn,
    messageApi,
    handleSave,
    handleSaveDraft,
    filterCyrillicOnly,
    capitalizeFirstLetter,
    lastSavedSnapshotRef,
  });

  const handleCancelWithConfirm = useMobileEmployeeCancelConfirm({
    form,
    modal,
    onCancel,
    lastSavedSnapshotRef,
  });

  const collapseItems = useMobileEmployeeFormSections({
    employee,
    user,
    defaultCounterpartyId,
    fireLoading,
    activateLoading,
    handleFire,
    handleReinstate,
    handleDeactivate,
    handleActivate,
    getFieldProps,
    formatInn,
    handleInnBlur,
    handleLastNameBlur,
    noAutoFillProps,
    latinInputError,
    antiAutofillIds,
    handleFullNameChange,
    loadingReferences,
    citizenships,
    handleCitizenshipChange,
    formatPhoneNumber,
    requiresPatent,
    formatSnils,
    formatBankAccountNumber,
    formatKig,
    documentProfileCode: resolveEmployeeDocumentProfile({
      counterpartyId: resolveEmployeeCounterpartyId({
        employee,
        fallbackCounterpartyId:
          form.getFieldValue("counterpartyId") || user?.counterpartyId || null,
      }),
      defaultCounterpartyId,
      citizenship: selectedCitizenship || employee?.citizenship || null,
    }),
    documentProfilesConfig,
    ensureEmployeeId,
    formatPatentNumber,
    formatBlankNumber,
    loadingCounterparties,
    availableCounterparties,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Скролируемая область с формой */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          paddingBottom: 156,
        }}
      >
        <BrowserAutofillTrap />
        <Form
          form={form}
          layout="vertical"
          initialValues={{ gender: "male" }}
          autoComplete="off"
          onFieldsChange={handleFormFieldsChange}
          requiredMark={false}
        >
          <Collapse
            activeKey={activeKeys}
            onChange={setActiveKeys}
            expandIcon={({ isActive }) => (
              <CaretRightOutlined rotate={isActive ? 90 : 0} />
            )}
            expandIconPosition="start"
            ghost
            items={collapseItems}
          />
        </Form>
      </div>

      <MobileEmployeeFormActions
        loading={loading}
        canSave={canSave}
        onSaveDraft={handleSaveDraftWithReset}
        onSave={handleSaveWithReset}
        onCancel={handleCancelWithConfirm}
      />
    </div>
  );
};

export default MobileEmployeeForm;
