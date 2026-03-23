import { describe, expect, it } from "vitest";
import {
  getConstructionSiteFilterLabel,
  mergeSortedUniqueStrings,
} from "./useEmployeeTableFilterOptions";

describe("useEmployeeTableFilterOptions helpers", () => {
  it("merges values from different sources without duplicates", () => {
    expect(
      mergeSortedUniqueStrings(
        ["Контрагент Б", "контрагент а"],
        ["Контрагент А", "Контрагент В", ""],
      ),
    ).toEqual(["контрагент а", "Контрагент Б", "Контрагент В"]);
  });

  it("uses short construction site name first", () => {
    expect(
      getConstructionSiteFilterLabel({
        shortName: "ЖК Север",
        fullName: "Жилой комплекс Север",
      }),
    ).toBe("ЖК Север");

    expect(
      getConstructionSiteFilterLabel({
        fullName: "Жилой комплекс Юг",
      }),
    ).toBe("Жилой комплекс Юг");
  });
});
