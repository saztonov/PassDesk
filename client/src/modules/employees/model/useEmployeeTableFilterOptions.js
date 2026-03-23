import { useEffect, useMemo, useState } from "react";
import positionService from "@/services/positionService";
import { citizenshipService } from "@/services/citizenshipService";
import { constructionSiteService } from "@/services/constructionSiteService";

export const getConstructionSiteFilterLabel = (site) =>
  String(site?.shortName || site?.name || site?.fullName || "").trim();

const loadAllConstructionSiteLabels = async () => {
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

  useEffect(() => {
    let cancelled = false;

    const loadReferenceFilters = async () => {
      try {
        const [positionsResponse, citizenshipsResponse, sitesResponse] =
          await Promise.all([
            positionService.getAll({ limit: 10000, page: 1 }),
            citizenshipService.getAll(),
            loadAllConstructionSiteLabels(),
          ]);

        if (cancelled) {
          return;
        }

        setPositions(
          positionsResponse?.data?.data?.positions?.map((position) => position?.name) ||
            [],
        );
        setCitizenships(
          citizenshipsResponse?.data?.data?.citizenships?.map(
            (citizenship) => citizenship?.name,
          ) || [],
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
  }, [defaultCounterpartyId, user]);

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
