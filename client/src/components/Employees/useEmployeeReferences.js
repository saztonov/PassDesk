import { useCallback } from "react";
import { counterpartyService } from "../../services/counterpartyService";
import { useReferencesStore } from "../../store/referencesStore";

const useEmployeeReferences = ({
  setCitizenships,
  setPositions,
  setDefaultCounterpartyId,
  setAvailableCounterparties,
  setLoadingCounterparties,
}) => {
  const fetchCitizenships = useCallback(async () => {
    try {
      const { fetchCitizenships: fetchFromCache } =
        useReferencesStore.getState();
      const loadedCitizenships = await fetchFromCache();
      setCitizenships(loadedCitizenships);
      return loadedCitizenships;
    } catch (error) {
      console.error("Error loading citizenships:", error);
      return [];
    }
  }, [setCitizenships]);

  const fetchPositions = useCallback(async () => {
    try {
      const { fetchPositions: fetchFromCache } =
        useReferencesStore.getState();
      const loadedPositions = await fetchFromCache();
      setPositions(loadedPositions);
      return loadedPositions;
    } catch (error) {
      console.error("Error loading positions:", error);
      return [];
    }
  }, [setPositions]);

  const fetchDefaultCounterparty = useCallback(async () => {
    try {
      const { fetchSettings } = useReferencesStore.getState();
      const cachedSettings = useReferencesStore.getState().settings;
      const shouldForceRefresh =
        !cachedSettings?.defaultCounterpartyId ||
        !cachedSettings?.employeeDocumentProfiles;
      const settings = await fetchSettings(shouldForceRefresh);
      const dcId = settings?.defaultCounterpartyId;
      setDefaultCounterpartyId(dcId);
      return dcId;
    } catch (error) {
      console.error("Error loading default counterparty:", error);
      return null;
    }
  }, [setDefaultCounterpartyId]);

  const fetchCounterparties = useCallback(async () => {
    try {
      setLoadingCounterparties(true);
      const response = await counterpartyService.getAvailable();
      if (response.data.success) {
        setAvailableCounterparties(response.data.data);
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error("Error loading counterparties:", error);
      setAvailableCounterparties([]);
      return [];
    } finally {
      setLoadingCounterparties(false);
    }
  }, [setAvailableCounterparties, setLoadingCounterparties]);

  return {
    fetchCitizenships,
    fetchPositions,
    fetchDefaultCounterparty,
    fetchCounterparties,
  };
};

export default useEmployeeReferences;
