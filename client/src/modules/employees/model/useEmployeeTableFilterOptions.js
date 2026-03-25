import { useEffect, useMemo, useState } from "react";
import { constructionSiteService } from "@/services/constructionSiteService";
import { useReferencesStore } from "@/store/referencesStore";

const REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;
let constructionSiteLabelsCache = null;
let constructionSiteLabelsLastFetch = 0;

export const getConstructionSiteFilterLabel = (site) =>
  String(site?.shortName || site?.name || site?.fullName || "").trim();

const loadAllConstructionSiteLabels = async () => {
  const now = Date.now();
  if (
    Array.isArray(constructionSiteLabelsCache) &&
    now - constructionSiteLabelsLastFetch < REFERENCE_CACHE_TTL_MS
  ) {
    return constructionSiteLabelsCache;
  }

  const labels = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await constructionSiteService.getAll({
      limit: 100,
      page,
    });
    const payload = response?.data?.data || {};
    const sites = Array.isArray(payload.constructionSites)
      ? payload.constructionSites
      : [];

    labels.push(...sites.map(getConstructionSiteFilterLabel));
    totalPages = Number(payload.pagination?.pages || 1);
    page += 1;
  }

  constructionSiteLabelsCache = labels;
  constructionSiteLabelsLastFetch = Date.now();
  return labels;
};

export const mergeSortedUniqueStrings = (...collections) => {
  const seen = new Set();

  return collections
    .flat()
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value) => {
      const normalizedValue = value.toLowerCase();
      if (seen.has(normalizedValue)) {
        return false;
      }
      seen.add(normalizedValue);
      return true;
    })
    .sort((left, right) =>
      left.localeCompare(right, "ru", {
        sensitivity: "base",
        numeric: true,
      }),
    );
};

export const useEmployeeTableFilterOptions = ({
  user,
  defaultCounterpartyId,
  counterpartyOptions,
  uniqueFilters,
}) => {
  const [positions, setPositions] = useState([]);
  const [citizenships, setCitizenships] = useState([]);
  const [constructionSites, setConstructionSites] = useState([]);
  const { fetchPositions, fetchCitizenships } = useReferencesStore();

  useEffect(() => {
    let cancelled = false;

    const loadReferenceFilters = async () => {
      try {
        const [positionsData, citizenshipsData, sitesResponse] =
          await Promise.all([
            fetchPositions(),
            fetchCitizenships(),
            loadAllConstructionSiteLabels(),
          ]);

        if (cancelled) {
          return;
        }

        setPositions(
          Array.isArray(positionsData)
            ? positionsData.map((position) => position?.name)
            : [],
        );
        setCitizenships(
          Array.isArray(citizenshipsData)
            ? citizenshipsData.map((citizenship) => citizenship?.name)
            : [],
        );
        setConstructionSites(
          Array.isArray(sitesResponse) ? sitesResponse : [],
        );
      } catch (error) {
        if (!cancelled) {
          console.warn("Ошибка загрузки опций фильтров сотрудников:", error);
        }
      }
    };

    if (user && defaultCounterpartyId !== undefined) {
      loadReferenceFilters();
    }

    return () => {
      cancelled = true;
    };
  }, [defaultCounterpartyId, fetchCitizenships, fetchPositions, user]);

  return useMemo(
    () => ({
      fullNames: uniqueFilters.fullNames,
      positions: mergeSortedUniqueStrings(uniqueFilters.positions, positions),
      counterparties: counterpartyOptions,
      constructionSites: mergeSortedUniqueStrings(
        uniqueFilters.constructionSites,
        constructionSites,
      ),
      citizenships: mergeSortedUniqueStrings(
        uniqueFilters.citizenships,
        citizenships,
      ),
    }),
    [
      constructionSites,
      counterpartyOptions,
      citizenships,
      positions,
      uniqueFilters.constructionSites,
      uniqueFilters.citizenships,
      uniqueFilters.fullNames,
      uniqueFilters.positions,
    ],
  );
};
