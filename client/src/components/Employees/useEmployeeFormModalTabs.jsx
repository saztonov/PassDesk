import { useMemo } from "react";
import { Divider, Typography } from "antd";
import { CheckCircleFilled, CheckCircleOutlined } from "@ant-design/icons";
import EmployeeBasicInfoTab from "./EmployeeBasicInfoTab.jsx";
import EmployeeDocumentsTab from "./EmployeeDocumentsTab.jsx";
import EmployeePatentTab from "./EmployeePatentTab.jsx";
import EmployeeCounterpartyTab from "./EmployeeCounterpartyTab.jsx";
import EmployeeFilesTab from "./EmployeeFilesTab.jsx";

const { Text } = Typography;

export const useEmployeeFormModalTabs = ({
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
  dateFormat,
  availableCounterparties,
  loadingCounterparties,
  handleFilesChange,
  tabsValidation,
  documentProfilesConfig,
}) => {
  return useMemo(() => {
    const getTabIcon = (tabKey) => {
      if (tabsValidation[tabKey]) {
        return (
          <CheckCircleFilled
            style={{ color: "#52c41a", fontSize: 16, marginRight: 8 }}
          />
        );
      }
      return (
        <CheckCircleOutlined
          style={{ color: "#d9d9d9", fontSize: 16, marginRight: 8 }}
        />
      );
    };

    const items = [
      {
        key: "1",
        label: (
          <span>
            {getTabIcon("1")}
            Личная информация
          </span>
        ),
        children: (
          <>
            <EmployeeBasicInfoTab
              employee={employee}
              messageApi={message}
              onCancel={onCancel}
              user={user}
              defaultCounterpartyId={defaultCounterpartyId}
              onTransfer={() => setTransferModalVisible(true)}
              getFieldProps={getFieldProps}
              positions={positions}
              citizenships={citizenships}
              handleCitizenshipChange={handleCitizenshipChange}
              antiAutofillIds={antiAutofillIds}
              latinInputError={latinInputError}
              handleFullNameChange={handleFullNameChange}
              handleInnBlur={handleInnBlur}
              dateFormat={dateFormat}
            />

            <Divider style={{ margin: "12px 0" }} />
            <Text strong style={{ display: "block", marginBottom: 12 }}>
              Документы
            </Text>
            <EmployeeDocumentsTab
              getFieldProps={getFieldProps}
              passportType={passportType}
              setPassportType={setPassportType}
              dateFormat={dateFormat}
            />

            {(requiresPatent || checkingCitizenship) && (
              <>
                <Divider style={{ margin: "12px 0" }} />
                <Text strong style={{ display: "block", marginBottom: 12 }}>
                  Патент
                  {checkingCitizenship ? " (проверка...)" : ""}
                </Text>
                {checkingCitizenship ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "24px 0",
                      color: "#999",
                    }}
                  >
                    Проверка необходимости патента...
                  </div>
                ) : (
                  <EmployeePatentTab
                    getFieldProps={getFieldProps}
                    dateFormat={dateFormat}
                  />
                )}
              </>
            )}

            <Divider style={{ margin: "12px 0" }} />
            <Text strong style={{ display: "block", marginBottom: 12 }}>
              Контрагент
            </Text>
            <EmployeeCounterpartyTab
              availableCounterparties={availableCounterparties}
              loadingCounterparties={loadingCounterparties}
            />
          </>
        ),
      },
    ];

    if (employee?.id) {
      items.push({
        key: "4",
        label: "Файлы",
        children: (
          <EmployeeFilesTab
            employee={employee}
            selectedCitizenship={selectedCitizenship}
            defaultCounterpartyId={defaultCounterpartyId}
            userCounterpartyId={user?.counterpartyId || null}
            onFilesUpdated={handleFilesChange}
            documentProfilesConfig={documentProfilesConfig}
          />
        ),
      });
    }

    return items;
  }, [
    antiAutofillIds,
    availableCounterparties,
    checkingCitizenship,
    citizenships,
    selectedCitizenship,
    dateFormat,
    defaultCounterpartyId,
    employee,
    getFieldProps,
    handleCitizenshipChange,
    handleFilesChange,
    handleFullNameChange,
    handleInnBlur,
    latinInputError,
    loadingCounterparties,
    message,
    onCancel,
    passportType,
    positions,
    requiresPatent,
    setPassportType,
    setTransferModalVisible,
    tabsValidation,
    user,
    documentProfilesConfig,
  ]);
};
