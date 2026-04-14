import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { applicationService } from "@/services/applicationService";
import { formatApplicationRequestCell } from "@/modules/employees/lib/applicationRequestExcel";

export const useApplicationRequestExport = ({
  message,
  navigate,
  selectedEmployees,
  availableEmployees,
  selectedColumns,
  refetchEmployees,
}) => {
  const [exportLoading, setExportLoading] = useState(false);

  const activeColumns = useMemo(
    () => selectedColumns.filter((col) => col.enabled && col.key !== "number"),
    [selectedColumns],
  );

  const hasNumberColumn = useMemo(
    () => Boolean(selectedColumns.find((col) => col.key === "number")?.enabled),
    [selectedColumns],
  );

  const handleCreateRequest = useCallback(async () => {
    if (selectedEmployees.length === 0) {
      message.warning("Выберите хотя бы одного сотрудника для заявки");
      return;
    }

    try {
      setExportLoading(true);

      await applicationService.create({
        employeeIds: selectedEmployees,
      });

      const employeesToExport = availableEmployees.filter((employee) =>
        selectedEmployees.includes(employee.id),
      );

      const excelData = employeesToExport.map((employee, index) => {
        const row = {};

        if (hasNumberColumn) {
          row["№"] = index + 1;
        }

        activeColumns.forEach((column) => {
          row[column.label] = formatApplicationRequestCell(employee, column.key);
        });

        return row;
      });

      const XLSX = await import("xlsx");

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const columnWidths = [];
      if (hasNumberColumn) {
        columnWidths.push({ wch: 6 });
      }
      activeColumns.forEach(() => columnWidths.push({ wch: 20 }));
      worksheet["!cols"] = columnWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Заявка");

      const fileName = `Заявка_${dayjs().format("DD-MM-YYYY_HH-mm")}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      message.success(`Заявка создана и файл сохранен: ${fileName}`);
      await refetchEmployees();
      navigate("/employees");
    } catch (error) {
      console.error("Create request error:", error);
      message.error("Ошибка при создании заявки");
    } finally {
      setExportLoading(false);
    }
  }, [
    activeColumns,
    availableEmployees,
    hasNumberColumn,
    message,
    navigate,
    refetchEmployees,
    selectedEmployees,
  ]);

  return {
    exportLoading,
    handleCreateRequest,
  };
};
