import { useMemo, useState } from "react";
import { employeeApi } from "@/entities/employee";
import { readEmployeesFromExcelFile } from "@/modules/employees/lib/employeeImportExcel";
import {
  buildEmployeesForImport,
  calculateTotalEmployeesForImport,
  resolveAllConflictResolutions,
} from "@/modules/employees/lib/employeeImportUtils";
import { getEmployeeImportProfile } from "@/modules/employees/model/employeeImportProfiles";

export const EMPLOYEE_IMPORT_STEPS = [
  { title: "Загрузка", description: "Выбор файла" },
  { title: "Проверка", description: "Валидация данных" },
  { title: "Конфликты", description: "Разрешение конфликтов" },
  { title: "Импорт", description: "Выполнение" },
  { title: "Результаты", description: "Завершено" },
];

export const useEmployeeImportFlow = ({
  messageApi,
  onCancel,
  onSuccess,
  profile = "default",
}) => {
  const profileConfig = getEmployeeImportProfile(profile);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const [conflictResolutions, setConflictResolutions] = useState({});
  const [importResult, setImportResult] = useState(null);

  const totalEmployees = useMemo(
    () =>
      calculateTotalEmployeesForImport({
        validEmployees: validationResult?.validEmployees || [],
        conflictingInns: validationResult?.conflictingInns || [],
        conflictResolutions,
      }),
    [conflictResolutions, validationResult],
  );

  const resetModal = () => {
    setStep(0);
    setLoading(false);
    setFileData(null);
    setFileName("");
    setValidationResult(null);
    setConflictResolutions({});
    setImportResult(null);
  };

  const handleCancel = () => {
    resetModal();
    onCancel();
  };

  const handleFileSelect = async (file) => {
    try {
      setLoading(true);
      const mappedData = await readEmployeesFromExcelFile(file);
      setFileData(mappedData);
      setFileName(file.name);
      messageApi.success(`Файл загружен: ${mappedData.length} записей`);
    } catch (_error) {
      messageApi.error("Ошибка при чтении файла");
    } finally {
      setLoading(false);
    }

    return false;
  };

  const handleValidate = async () => {
    if (!fileData?.length) {
      messageApi.warning("Выберите файл для загрузки");
      return;
    }

    try {
      setLoading(true);
      const response = await employeeApi.validateEmployeesImport(fileData);
      const result = response?.data?.data;
      setValidationResult(result);

      if (result?.hasErrors || result?.hasConflicts) {
        setStep(2);
        return;
      }

      setStep(3);
    } catch (error) {
      messageApi.error(error.response?.data?.message || "Ошибка валидации");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      setLoading(true);

      const employees = buildEmployeesForImport({
        validEmployees: validationResult?.validEmployees || [],
        conflictingInns: validationResult?.conflictingInns || [],
        conflictResolutions,
        fileData: fileData || [],
      });

      const response = await employeeApi.importEmployees(
        employees,
        conflictResolutions,
      );
      setImportResult(response?.data?.data);
      setStep(4);
      messageApi.success("Импорт завершен");
      onSuccess?.();
    } catch (error) {
      messageApi.error(error.response?.data?.message || "Ошибка при импорте");
    } finally {
      setLoading(false);
    }
  };

  const handleConflictResolutionChange = (inn, resolution) => {
    setConflictResolutions((prev) => ({
      ...prev,
      [inn]: resolution,
    }));
  };

  const handleResolveAllConflicts = (resolution) => {
    setConflictResolutions(
      resolveAllConflictResolutions(
        validationResult?.conflictingInns || [],
        resolution,
      ),
    );
  };

  const handleNext = async () => {
    if (step === 0) {
      if (!fileData) {
        messageApi.warning("Выберите файл");
        return;
      }
      setStep(1);
      return;
    }

    if (step === 1) {
      await handleValidate();
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    if (step === 3) {
      await handleImport();
      return;
    }

    if (step === 4) {
      onSuccess?.();
      handleCancel();
    }
  };

  const handlePrevious = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const nextButtonText = useMemo(() => {
    if (step === 0) return "Проверить";
    if (step === 1) return "Далее";
    if (step === 2) return "Начать импорт";
    if (step === 3) return loading ? "Импортирование..." : "Импортировать";
    if (step === 4) return "Завершить";
    return "Далее";
  }, [loading, step]);

  const modalTitle = useMemo(() => {
    if (step !== 4) {
      return profileConfig.baseModalTitle;
    }

    const hasErrors = (importResult?.errors?.length || 0) > 0;
    const created = importResult?.created || 0;
    const updated = importResult?.updated || 0;

    if (created > 0 || updated > 0) {
      return hasErrors
        ? "✅ Импорт завершен с предупреждениями"
        : "✅ Импорт успешно завершен";
    }

    return "Результаты импорта";
  }, [importResult, profileConfig.baseModalTitle, step]);

  return {
    profileConfig,
    step,
    loading,
    fileData,
    fileName,
    validationResult,
    conflictResolutions,
    importResult,
    totalEmployees,
    handleCancel,
    handleFileSelect,
    handleNext,
    handlePrevious,
    handleConflictResolutionChange,
    handleResolveAllConflicts,
    nextButtonText,
    modalTitle,
  };
};
