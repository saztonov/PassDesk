import { useMemo } from "react";
import { getUniqueFilterValues } from "@/entities/employee";

const normalizeDocSearch = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-ZА-ЯЁ]/g, "");

const normalizeTextSearch = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeDigitsSearch = (value) =>
  String(value || "").replace(/[^\d]/g, "");

export const useFilteredEmployees = ({
  employees,
  searchText,
  statusFilter,
  counterpartyFilter,
  skipSearchFiltering = false,
}) => {
  const filteredEmployees = useMemo(() => {
    let filtered = employees;

    if (statusFilter) {
      filtered = filtered.filter((employee) => {
        const cardStatusMapping = employee.statusMappings?.find((item) => {
          const group = item.statusGroup || item.status_group;
          return group === "status_card" || group === "card draft";
        });

        const mainStatusMapping = employee.statusMappings?.find((item) => {
          const group = item.statusGroup || item.status_group;
          return group === "status" || group === "draft";
        });

        const activeStatusMapping = employee.statusMappings?.find(
          (item) =>
            item.statusGroup === "status_active" ||
            item.status_group === "status_active",
        );

        const mainStatus = mainStatusMapping?.status?.name;
        const isDraft =
          cardStatusMapping?.status?.name === "status_card_draft" ||
          mainStatus === "status_draft";
        const isProcessed =
          cardStatusMapping?.status?.name === "status_card_processed";
        const isFired =
          activeStatusMapping?.status?.name === "status_active_fired";
        const isInactive =
          activeStatusMapping?.status?.name === "status_active_inactive";
        const isActive =
          mainStatus === "status_new" ||
          mainStatus === "status_tb_passed" ||
          mainStatus === "status_processed";

        if (statusFilter === "draft") return isDraft;
        if (statusFilter === "processed") return isProcessed;
        if (statusFilter === "active") return isActive;
        if (statusFilter === "fired") return isFired;
        if (statusFilter === "inactive") return isInactive;
        return true;
      });
    }

    if (skipSearchFiltering || !searchText) return filtered;

    const normalizedSearchText = normalizeTextSearch(searchText);
    const searchTokens = normalizedSearchText
      ? normalizedSearchText.split(" ").filter(Boolean)
      : [];
    const normalizedDigitsSearchValue = normalizeDigitsSearch(searchText);
    const normalizedDocSearchValue = normalizeDocSearch(searchText);
    const hasTextQuery = normalizedSearchText.length > 0;
    const hasDigitsQuery = normalizedDigitsSearchValue.length > 0;
    const hasDocQuery = normalizedDocSearchValue.length > 0;

    if (!hasTextQuery && !hasDigitsQuery && !hasDocQuery) {
      return filtered;
    }

    return filtered.filter((employee) => {
      const normalizedPassport = normalizeDocSearch(employee.passportNumber);
      const normalizedKig = normalizeDocSearch(employee.kig);
      const normalizedPatent = normalizeDocSearch(employee.patentNumber);
      const fullName = normalizeTextSearch(
        `${employee.lastName || ""} ${employee.firstName || ""} ${employee.middleName || ""}`,
      );
      const positionName = normalizeTextSearch(employee.position?.name);
      const firstName = normalizeTextSearch(employee.firstName);
      const lastName = normalizeTextSearch(employee.lastName);
      const middleName = normalizeTextSearch(employee.middleName);

      const isTextMatch =
        hasTextQuery &&
        (firstName.includes(normalizedSearchText) ||
          lastName.includes(normalizedSearchText) ||
          middleName.includes(normalizedSearchText) ||
          fullName.includes(normalizedSearchText) ||
          positionName.includes(normalizedSearchText) ||
          searchTokens.every((token) => fullName.includes(token)));

      const isDigitsMatch =
        hasDigitsQuery &&
        (normalizeDigitsSearch(employee.inn).includes(
          normalizedDigitsSearchValue,
        ) ||
          normalizeDigitsSearch(employee.snils).includes(
            normalizedDigitsSearchValue,
          ) ||
          normalizeDigitsSearch(employee.phone).includes(
            normalizedDigitsSearchValue,
          ) ||
          normalizeDigitsSearch(employee.passportNumber).includes(
            normalizedDigitsSearchValue,
          ) ||
          normalizeDigitsSearch(employee.patentNumber).includes(
            normalizedDigitsSearchValue,
          ) ||
          normalizeDigitsSearch(employee.kig).includes(
            normalizedDigitsSearchValue,
          ));

      const isDocumentExact =
        hasDocQuery &&
        (normalizedPassport === normalizedDocSearchValue ||
          normalizedKig === normalizedDocSearchValue ||
          normalizedPatent === normalizedDocSearchValue);

      return isTextMatch || isDigitsMatch || isDocumentExact;
    });
  }, [employees, searchText, skipSearchFiltering, statusFilter]);

  const uniqueFilters = useMemo(
    () => getUniqueFilterValues(filteredEmployees, counterpartyFilter),
    [filteredEmployees, counterpartyFilter],
  );

  return {
    filteredEmployees,
    uniqueFilters,
  };
};
