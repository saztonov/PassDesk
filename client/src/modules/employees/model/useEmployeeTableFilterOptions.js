import { useMemo } from "react";

export const getConstructionSiteFilterLabel = (site) =>
  String(site?.shortName || site?.name || site?.fullName || "").trim();

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
  counterpartyOptions,
  uniqueFilters,
}) =>
  useMemo(
    () => ({
      fullNames: uniqueFilters.fullNames,
      positions: mergeSortedUniqueStrings(uniqueFilters.positions),
      counterparties: counterpartyOptions,
      constructionSites: mergeSortedUniqueStrings(uniqueFilters.constructionSites),
      citizenships: mergeSortedUniqueStrings(uniqueFilters.citizenships),
    }),
    [
      counterpartyOptions,
      uniqueFilters.constructionSites,
      uniqueFilters.citizenships,
      uniqueFilters.fullNames,
      uniqueFilters.positions,
    ],
  );
