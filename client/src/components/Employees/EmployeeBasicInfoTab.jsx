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
    />

    <EmployeeBasicInfoSecondaryRows
      getFieldProps={getFieldProps}
      userRole={user?.role}
    />
  </>
);

export default EmployeeBasicInfoTab;
