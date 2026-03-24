import EmployeeBasicInfoHeader from "./EmployeeBasicInfoHeader.jsx";
import EmployeeBasicInfoPrimaryRows from "./EmployeeBasicInfoPrimaryRows.jsx";
import EmployeeBasicInfoSecondaryRows from "./EmployeeBasicInfoSecondaryRows.jsx";

const EmployeeBasicInfoTab = ({
  form,
  employee,
  messageApi,
  onCancel,
  user,
  defaultCounterpartyId,
  onTransfer,
  getFieldProps,
  positions,
  citizenships,
  handleCitizenshipChange,
  antiAutofillIds,
  latinInputError,
  handleFullNameChange,
  dateFormat,
  passportType,
  setPassportType,
  compactLayout,
}) => (
  <>
    <EmployeeBasicInfoHeader
      employee={employee}
      messageApi={messageApi}
      onCancel={onCancel}
      user={user}
      defaultCounterpartyId={defaultCounterpartyId}
      onTransfer={onTransfer}
    />

    <EmployeeBasicInfoPrimaryRows
      form={form}
      getFieldProps={getFieldProps}
      positions={positions}
      citizenships={citizenships}
      handleCitizenshipChange={handleCitizenshipChange}
      antiAutofillIds={antiAutofillIds}
      latinInputError={latinInputError}
      handleFullNameChange={handleFullNameChange}
      dateFormat={dateFormat}
      passportType={passportType}
      setPassportType={setPassportType}
      compactLayout={compactLayout}
    />

    <EmployeeBasicInfoSecondaryRows
      getFieldProps={getFieldProps}
      userRole={user?.role}
    />
  </>
);

export default EmployeeBasicInfoTab;
