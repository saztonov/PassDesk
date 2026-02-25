import dayjs from "dayjs";
import EmployeeDocumentUpload from "@/components/Employees/EmployeeDocumentUpload";
import {
  getDocumentTypeCodesForProfile,
  profileDocumentTypeLabels,
} from "@/modules/employees/lib/documentTypeProfiles";

const DATE_FORMAT = "DD.MM.YYYY";
const CONSENT_DOCUMENT_TYPES = new Set([
  "consent",
  "biometric_consent",
  "biometric_consent_developer",
]);

export const formatDateInputValue = (value) => {
  if (!value) return value;
  if (typeof value === "string") return value;
  if (value && value.format) return value.format(DATE_FORMAT);
  return value;
};

export const createDateInputRules = (rules = []) => [
  ...rules,
  {
    pattern: /^\d{2}\.\d{2}\.\d{4}$/,
    message: "Дата должна быть в формате ДД.ММ.ГГГГ",
  },
  {
    validator: (_, value) => {
      if (!value) {
        return Promise.resolve();
      }
      try {
        const dateObj = dayjs(value, DATE_FORMAT, true);
        if (!dateObj.isValid()) {
          return Promise.reject(new Error("Некорректная дата"));
        }
      } catch {
        return Promise.reject(new Error("Некорректная дата"));
      }
      return Promise.resolve();
    },
  },
];

export const getUploadsForDocumentProfile = (
  profileCode,
  profilesConfig = null,
) => {
  const profileCodes = getDocumentTypeCodesForProfile(
    profileCode,
    profilesConfig,
  );

  return profileCodes.map((documentType) => ({
    documentType,
    label: profileDocumentTypeLabels[documentType] || documentType,
    multiple: true,
  }));
};

export const splitUploadsByConsent = (uploads = []) => {
  const documentUploads = [];
  const consentUploads = [];

  uploads.forEach((upload) => {
    if (CONSENT_DOCUMENT_TYPES.has(upload?.documentType)) {
      consentUploads.push(upload);
      return;
    }
    documentUploads.push(upload);
  });

  return { documentUploads, consentUploads };
};

export const renderUploads = ({
  uploads,
  employee,
  ensureEmployeeId,
  handleDocumentUploadComplete,
}) =>
  uploads.map((upload) => (
    <EmployeeDocumentUpload
      key={upload.documentType}
      employeeId={employee?.id}
      ensureEmployeeId={ensureEmployeeId}
      documentType={upload.documentType}
      label={upload.label}
      readonly={false}
      multiple={upload.multiple}
      onUploadComplete={handleDocumentUploadComplete}
    />
  ));
