import * as XLSX from "xlsx";
import {
  ensureExcelRowLimit,
  validateExcelImportFile,
  XLSX_READ_SAFE_OPTIONS,
} from "@/shared/lib/xlsxSecurity";

export const readSkudBindingImportExcel = (file) =>
  new Promise((resolve, reject) => {
    try {
      validateExcelImportFile(file);
    } catch (validationError) {
      reject(validationError);
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) {
          throw new Error("Не удалось прочитать Excel-файл");
        }
        const workbook = XLSX.read(data, {
          type: "array",
          ...XLSX_READ_SAFE_OPTIONS,
        });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error("В Excel-файле нет листов");
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
          raw: false,
        });
        ensureExcelRowLimit(rows);
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("FileReader failed"));
    };

    reader.readAsArrayBuffer(file);
  });
