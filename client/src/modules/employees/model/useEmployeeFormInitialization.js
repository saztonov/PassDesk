import { useEffect } from "react";
import dayjs from "dayjs";
import { constructionSiteService } from "@/services/constructionSiteService";

export const useEmployeeFormInitialization = ({
  visible,
  employee,
  form,
  userCounterpartyId,
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
}) => {
  useEffect(() => {
    const abortController = new AbortController();

    const fetchConstructionSites = async () => {
      try {
        if (!userCounterpartyId || !defaultCounterpartyId) {
          return [];
        }

        if (userCounterpartyId === defaultCounterpartyId) {
          const { data } = await constructionSiteService.getAll();
          return data?.data?.constructionSites || [];
        }

        const { data } = await constructionSiteService.getCounterpartyObjects(
          userCounterpartyId,
        );
        return data?.data || [];
      } catch (error) {
        console.error("Error loading construction sites:", error);
        return [];
      }
    };

    const initializeModal = async () => {
      if (!visible) {
        setDataLoaded(false);
        setCheckingCitizenship(false);
        setSelectedCitizenship(null);
        setPassportType(null);
        return;
      }

      setDataLoaded(false);
      setActiveTab("1");

      try {
        const [loadedCitizenships] = await Promise.all([
          fetchCitizenships(),
          fetchConstructionSites(),
          fetchPositions(),
          fetchDefaultCounterparty(),
          fetchCounterparties(),
        ]);

        if (abortController.signal.aborted) {
          return;
        }

        if (employee) {
          setLinkingMode(getInitialLinkingMode(employee));

          const mapping = employee.employeeCounterpartyMappings?.[0];
          let isFired = false;
          let isInactive = false;

          if (Array.isArray(employee.statusMappings)) {
            const statusMapping = employee.statusMappings.find((item) => {
              const mappingGroup = item.statusGroup || item.status_group;
              return mappingGroup === "status_active";
            });
            if (statusMapping) {
              const statusObj = statusMapping.status || statusMapping.Status;
              const statusName = statusObj?.name;
              if (
                statusName === "status_active_fired" ||
                statusName === "status_active_fired_compl"
              ) {
                isFired = true;
              } else if (statusName === "status_active_inactive") {
                isInactive = true;
              }
            }
          }

          const formData = {
            ...employee,
            birthDate: employee.birthDate ? dayjs(employee.birthDate) : null,
            passportDate: employee.passportDate ? dayjs(employee.passportDate) : null,
            passportExpiryDate: employee.passportExpiryDate
              ? dayjs(employee.passportExpiryDate)
              : null,
            patentIssueDate: employee.patentIssueDate
              ? dayjs(employee.patentIssueDate)
              : null,
            kigEndDate: employee.kigEndDate ? dayjs(employee.kigEndDate) : null,
            constructionSiteId: mapping?.constructionSiteId || null,
            counterpartyId: mapping?.counterpartyId || null,
            birthCountryId: employee.birthCountryId || null,
            isFired,
            isInactive,
            inn: employee.inn ? formatInn(employee.inn) : null,
            snils: employee.snils ? formatSnils(employee.snils) : null,
            phone: employee.phone ? formatPhoneNumber(employee.phone) : null,
            bankAccountNumber: employee.bankAccountNumber
              ? employee.bankAccountNumber.replace(/[^\d]/g, "").slice(0, 20)
              : null,
            kig: employee.kig ? formatKig(employee.kig) : null,
            patentNumber: employee.patentNumber
              ? formatPatentNumber(employee.patentNumber)
              : null,
            blankNumber: employee.blankNumber
              ? formatBlankNumber(employee.blankNumber)
              : null,
          };

          form.setFieldsValue(formData);
          setPassportType(employee.passportType || null);
          setCheckingCitizenship(true);

          if (employee.citizenshipId && loadedCitizenships.length > 0) {
            const citizenship = loadedCitizenships.find(
              (item) => item.id === employee.citizenshipId,
            );
            if (citizenship) {
              setSelectedCitizenship(citizenship);
              const validation = computeValidationRef.current(citizenship);
              setTabsValidation(validation);
            }
          }

          setCheckingCitizenship(false);
          setDataLoaded(true);
          return;
        }

        form.resetFields();
        if (userCounterpartyId) {
          form.setFieldsValue({ counterpartyId: userCounterpartyId });
        }

        setActiveTab("1");
        setTabsValidation({ 1: false, 2: false, 3: false });
        setSelectedCitizenship(null);
        setDataLoaded(true);
      } catch (error) {
        if (error.name === "AbortError" || error.name === "CanceledError") {
          return;
        }
        console.error("❌ EmployeeFormModal: initialization error", error);
        if (!abortController.signal.aborted) {
          setCheckingCitizenship(false);
          setDataLoaded(true);
        }
      }
    };

    initializeModal();

    return () => {
      abortController.abort();
    };
  }, [
    computeValidationRef,
    defaultCounterpartyId,
    employee,
    fetchCitizenships,
    fetchCounterparties,
    fetchDefaultCounterparty,
    fetchPositions,
    form,
    formatBlankNumber,
    formatInn,
    formatKig,
    formatPatentNumber,
    formatPhoneNumber,
    formatSnils,
    getInitialLinkingMode,
    setActiveTab,
    setCheckingCitizenship,
    setDataLoaded,
    setLinkingMode,
    setPassportType,
    setSelectedCitizenship,
    setTabsValidation,
    userCounterpartyId,
    visible,
  ]);
};
