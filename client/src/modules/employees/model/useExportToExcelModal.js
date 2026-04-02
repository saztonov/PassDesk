import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { useEmployees } from "@/entities/employee";
import { constructionSiteService } from "@/services/constructionSiteService";
import { counterpartyService } from "@/services/counterpartyService";
import {
  buildExportExcelRows,
} from "@/modules/employees/lib/exportToExcelModalUtils";

export const useExportToExcelModal = ({
  visible,
  onCancel,
  messageApi,
}) => {
  const [exportLoading, setExportLoading] = useState(false);
  const [constructionSites, setConstructionSites] = useState([]);
  const [counterparties, setCounterparties] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [checkRequiredFields, setCheckRequiredFields] = useState(true);
  const [constructionSiteId, setConstructionSiteId] = useState(null);
  const [counterpartyId, setCounterpartyId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loadedEmployeesById, setLoadedEmployeesById] = useState({});

  const employeeQueryParams = useMemo(() => {
    if (!constructionSiteId || !counterpartyId) {
      return {};
    }

    const params = {
      page: currentPage,
      limit: pageSize,
      constructionSiteId,
      counterpartyIds: JSON.stringify([counterpartyId]),
    };

    if (checkRequiredFields) {
      params.statusCard = JSON.stringify(["completed"]);
    }

    return params;
  }, [
    constructionSiteId,
    counterpartyId,
    currentPage,
    pageSize,
    checkRequiredFields,
  ]);

  const {
    employees,
    loading: employeesLoading,
    backgroundLoading,
    totalCount,
  } = useEmployees(
    false,
    employeeQueryParams,
    visible && Boolean(constructionSiteId && counterpartyId),
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const fetchInitialData = async () => {
      try {
        const [sitesResponse, counterpartiesResponse] = await Promise.all([
          constructionSiteService.getAll(),
          counterpartyService.getAll({ limit: 10000, page: 1 }),
        ]);

        setConstructionSites(sitesResponse?.data?.data?.constructionSites || []);
        setCounterparties(
          counterpartiesResponse?.data?.data?.counterparties || [],
        );
      } catch (error) {
        console.error("Error loading export filters:", error);
      }
    };

    fetchInitialData();
    setCheckRequiredFields(true);
    setConstructionSiteId(null);
    setCounterpartyId(null);
    setCurrentPage(1);
    setPageSize(10);
    setSelectedEmployees([]);
    setLoadedEmployeesById({});
  }, [visible]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedEmployees([]);
    setLoadedEmployeesById({});
  }, [constructionSiteId, counterpartyId, checkRequiredFields]);

  useEffect(() => {
    if (!constructionSiteId || !counterpartyId) {
      return;
    }

    setLoadedEmployeesById((prev) => {
      const next = { ...prev };
      employees.forEach((employee) => {
        next[employee.id] = employee;
      });
      return next;
    });
  }, [constructionSiteId, counterpartyId, employees]);

  useEffect(() => {
    if (employees.length === 0) {
      return;
    }

    setSelectedEmployees((prev) => {
      if (prev.length > 0) {
        return prev;
      }

      return employees.map((employee) => employee.id);
    });
  }, [employees]);

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys: selectedEmployees,
      preserveSelectedRowKeys: true,
      onChange: (selectedRowKeys) => {
        setSelectedEmployees(selectedRowKeys);
      },
    }),
    [selectedEmployees],
  );

  const handleExport = async () => {
    if (selectedEmployees.length === 0) {
      messageApi.warning("Выберите хотя бы одного сотрудника для экспорта");
      return;
    }

    try {
      setExportLoading(true);

      const selectedRows = Object.values(loadedEmployeesById).filter((employee) =>
        selectedEmployees.includes(employee.id),
      );
      const employeesToExport = checkRequiredFields
        ? selectedRows.filter((employee) => employee.statusCard === "completed")
        : selectedRows;

      if (employeesToExport.length === 0) {
        messageApi.warning(
          "Нет сотрудников с заполненной карточкой для экспорта",
        );
        return;
      }

      const rows = buildExportExcelRows({
        employees: employeesToExport,
        constructionSiteId,
        counterpartyId,
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Сотрудники");

      const fileName = `Сотрудники_${dayjs().format("DD-MM-YYYY_HH-mm")}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      messageApi.success(`Файл успешно сохранен: ${fileName}`);
      onCancel();
    } catch (error) {
      console.error("Export error:", error);
      messageApi.error("Ошибка при экспорте в Excel");
    } finally {
      setExportLoading(false);
    }
  };

  return {
    loading: exportLoading || employeesLoading || backgroundLoading,
    constructionSites,
    counterparties,
    employees,
    totalCount,
    currentPage,
    pageSize,
    selectedEmployees,
    checkRequiredFields,
    setCheckRequiredFields,
    constructionSiteId,
    setConstructionSiteId,
    counterpartyId,
    setCounterpartyId,
    setCurrentPage,
    setPageSize,
    rowSelection,
    handleExport,
  };
};
