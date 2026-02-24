import { useEffect } from "react";
import { counterpartyService } from "@/services/counterpartyService";

export const useMobileEmployeeFormInitialization = ({
  employee,
  employeeIdOnLoad,
  setEmployeeIdOnLoad,
  citizenshipsLength,
  initializeEmployeeData,
  form,
  lastSavedSnapshotRef,
  handleCitizenshipChange,
  userCounterpartyId,
  setAvailableCounterparties,
  setLoadingCounterparties,
}) => {
  useEffect(() => {
    if (citizenshipsLength) {
      if (employee?.id !== employeeIdOnLoad) {
        const formData = initializeEmployeeData(true);
        if (formData) {
          form.setFieldsValue({
            passportType: formData.passportType || "foreign",
            ...formData,
          });
          lastSavedSnapshotRef.current = JSON.stringify(form.getFieldsValue(true));

          if (employee?.citizenshipId) {
            handleCitizenshipChange(employee.citizenshipId);
          }
        } else {
          form.resetFields();
          form.setFieldsValue({ passportType: "foreign" });
          lastSavedSnapshotRef.current = JSON.stringify(form.getFieldsValue(true));
        }
        setEmployeeIdOnLoad(employee?.id);
      }
    }
  }, [
    citizenshipsLength,
    employee?.citizenshipId,
    employee?.id,
    employeeIdOnLoad,
    form,
    handleCitizenshipChange,
    initializeEmployeeData,
    lastSavedSnapshotRef,
    setEmployeeIdOnLoad,
  ]);

  useEffect(() => {
    const loadCounterparties = async () => {
      setLoadingCounterparties(true);
      try {
        const response = await counterpartyService.getAvailable();
        if (response.data.success) {
          setAvailableCounterparties(response.data.data);

          if (
            !employee?.id &&
            userCounterpartyId &&
            !form.getFieldValue("counterpartyId")
          ) {
            form.setFieldsValue({ counterpartyId: userCounterpartyId });
          }
        }
      } catch (error) {
        console.error("Error loading counterparties:", error);
      } finally {
        setLoadingCounterparties(false);
      }
    };

    if (userCounterpartyId) {
      loadCounterparties();
    }
  }, [
    employee?.id,
    form,
    setAvailableCounterparties,
    setLoadingCounterparties,
    userCounterpartyId,
  ]);
};
