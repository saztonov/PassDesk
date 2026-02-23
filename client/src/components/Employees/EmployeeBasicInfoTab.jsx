import EmployeeBasicInfoHeader from "./EmployeeBasicInfoHeader.jsx";
import EmployeeBasicInfoPrimaryRows from "./EmployeeBasicInfoPrimaryRows.jsx";
import EmployeeBasicInfoSecondaryRows from "./EmployeeBasicInfoSecondaryRows.jsx";

const EmployeeBasicInfoTab = ({
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
  handleInnBlur,
  dateFormat,
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

    <EmployeeBasicInfoSecondaryRows
      getFieldProps={getFieldProps}
      citizenships={citizenships}
      antiAutofillIds={antiAutofillIds}
    />
  </>
);

export default EmployeeBasicInfoTab;
