import { describe, expect, it } from "vitest";
import {
  applyDocumentTypeProfile,
  getDocumentTypeCodesForProfile,
  profileCodes,
} from "./documentTypeProfiles";
import {
  doesEmployeeRequirePatent,
  RESIDENCE_PERMIT_EXCLUDED_DOCUMENT_CODES,
} from "./patentRequirement";

const PATENT_CITIZENSHIP = { requiresPatent: true, isEaeu: false };

// Так профиль мигранта выглядит в настройке employee_document_profiles
const MIGRANT_PROFILE_CONFIG = {
  [profileCodes.DEFAULT_MIGRANT]: [
    "passport",
    "passport_translation",
    "kig",
    "kig_back",
    "patent_front",
    "patent_back",
    "bank_details",
    "snils_card",
    "visa",
    "arrival_notice",
    "patent_payment_receipt",
    "other",
  ],
};

describe("профиль документов и ВНЖ", () => {
  it("без ВНЖ профиль мигранта содержит патент и КИГ", () => {
    const codes = getDocumentTypeCodesForProfile(
      profileCodes.DEFAULT_MIGRANT,
      MIGRANT_PROFILE_CONFIG,
    );

    RESIDENCE_PERMIT_EXCLUDED_DOCUMENT_CODES.forEach((code) => {
      expect(codes).toContain(code);
    });
  });

  it("с ВНЖ из профиля мигранта уходят сканы патента и КИГ", () => {
    const codes = getDocumentTypeCodesForProfile(
      profileCodes.DEFAULT_MIGRANT,
      MIGRANT_PROFILE_CONFIG,
      null,
      { hasResidencePermit: true },
    );

    RESIDENCE_PERMIT_EXCLUDED_DOCUMENT_CODES.forEach((code) => {
      expect(codes).not.toContain(code);
    });
    // Остальные документы профиля на месте
    expect(codes).toContain("passport");
    expect(codes).toContain("passport_translation");
    expect(codes).toContain("visa");
    expect(codes).toContain("arrival_notice");
  });

  it("фильтр переживает принудительный kig из REQUIRED_PROFILE_CODES", () => {
    // Админ убрал kig из настроек — ensureRequiredByProfile возвращает его обратно,
    // и только фильтр ВНЖ, идущий последним, обязан его убрать.
    const profilesConfig = {
      [profileCodes.DEFAULT_MIGRANT]: ["passport", "bank_details"],
    };

    expect(
      getDocumentTypeCodesForProfile(
        profileCodes.DEFAULT_MIGRANT,
        profilesConfig,
      ),
    ).toContain("kig");

    const codes = getDocumentTypeCodesForProfile(
      profileCodes.DEFAULT_MIGRANT,
      profilesConfig,
      null,
      { hasResidencePermit: true },
    );

    expect(codes).not.toContain("kig");
    expect(codes).toContain("passport");
  });

  it("профили без патента ВНЖ не трогает", () => {
    const config = {
      [profileCodes.DEFAULT_RU]: ["passport", "bank_details", "snils_card"],
    };

    expect(
      getDocumentTypeCodesForProfile(profileCodes.DEFAULT_RU, config, null, {
        hasResidencePermit: true,
      }),
    ).toEqual(
      getDocumentTypeCodesForProfile(profileCodes.DEFAULT_RU, config),
    );
  });

  it("applyDocumentTypeProfile отбрасывает те же коды", () => {
    const documentTypes = [
      { value: "passport", label: "Паспорт" },
      { value: "kig", label: "КИГ (лиц.)" },
      { value: "kig_back", label: "КИГ (спин.)" },
      { value: "patent_front", label: "Патент (лиц.)" },
      { value: "patent_back", label: "Патент (спин.)" },
      { value: "patent_payment_receipt", label: "Чек оплаты патента" },
      { value: "other", label: "Иные документы" },
    ];

    const applied = applyDocumentTypeProfile({
      documentTypes,
      profileCode: profileCodes.DEFAULT_MIGRANT,
      profilesConfig: MIGRANT_PROFILE_CONFIG,
      hasResidencePermit: true,
    });

    const values = applied.map((item) => item.value);
    expect(values).toContain("passport");
    RESIDENCE_PERMIT_EXCLUDED_DOCUMENT_CODES.forEach((code) => {
      expect(values).not.toContain(code);
    });
  });

  it("ВНЖ снимает требование патента", () => {
    expect(
      doesEmployeeRequirePatent({
        citizenship: PATENT_CITIZENSHIP,
        hasResidencePermit: true,
      }),
    ).toBe(false);
    expect(
      doesEmployeeRequirePatent({
        citizenship: PATENT_CITIZENSHIP,
        hasResidencePermit: false,
      }),
    ).toBe(true);
  });
});
