/**
 * Единый источник истины: нужен ли сотруднику патент на работу.
 * Зеркало серверного server/src/utils/patentRequirement.js
 */

/**
 * Требует ли патент само по себе гражданство (без учёта документов сотрудника).
 * @param {Object} citizenship - запись справочника гражданств
 * @returns {boolean}
 */
export const doesCitizenshipRequirePatent = (citizenship) =>
  citizenship?.requiresPatent !== false && citizenship?.isEaeu !== true;

/**
 * Коды документов, которые не нужны сотруднику с ВНЖ.
 */
export const RESIDENCE_PERMIT_EXCLUDED_DOCUMENT_CODES = [
  "patent_front",
  "patent_back",
  "patent_payment_receipt",
  "kig",
  "kig_back",
];

/**
 * Требуется ли патент конкретному сотруднику.
 * ВНЖ снимает требование патента даже для «патентных» гражданств.
 * @param {Object} employee - сотрудник с полями citizenship и hasResidencePermit
 * @returns {boolean}
 */
export const doesEmployeeRequirePatent = (employee) =>
  employee?.hasResidencePermit !== true &&
  doesCitizenshipRequirePatent(employee?.citizenship);
