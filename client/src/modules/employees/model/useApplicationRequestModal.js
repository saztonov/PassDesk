import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { useExcelColumns } from "@/hooks/useExcelColumns";
import { applicationService } from "@/services/applicationService";
import { constructionSiteService } from "@/services/constructionSiteService";
import { counterpartyService } from "@/services/counterpartyService";
import { employeeApi } from "@/entities/employee";
import { getStatusPriority } from "@/entities/employee/model/utils";
import { buildApplicationRequestExcelData } from "@/modules/employees/lib/applicationRequestModalFormatters";
import { buildApplicationRequestModalColumns } from "@/modules/employees/ui/ApplicationRequestModalColumns";

export const useApplicationRequestModal = ({
  visible,
  allEmployees,
  userRole,
  userCounterpartyId,
  defaultCounterpartyId,
  userId,
  onCancel,
  messageApi,
}) => {
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [counterpartiesLoading, setCounterpartiesLoading] = useState(false);
  const [downloadingConsents, setDownloadingConsents] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [allSelected, setAllSelected] = useState(false);
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedCounterparty, setSelectedCounterparty] = useState(null);
  const [includeFired, setIncludeFired] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);
  const [availableCounterparties, setAvailableCounterparties] = useState([]);
  const [modalEmployees, setModalEmployees] = useState(allEmployees || []);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [employeesWithConsents, setEmployeesWithConsents] = useState({});

  const {
    columns: selectedColumns,
    updateColumns,
    toggleColumn,
    moveColumnUp,
    moveColumnDown,
    selectAll,
    deselectAll,
  } = useExcelColumns();

  useEffect(() => {
    if (!visible) {
      setModalEmployees(Array.isArray(allEmployees) ? allEmployees : []);
      return;
    }

    let cancelled = false;
    const loadModalEmployees = async () => {
      setTableLoading(true);
      try {
        const response = await employeeApi.getAll({
          activeOnly: false,
          page: 1,
          limit: 10000,
        });
        const employeesFromApi = response?.data?.employees || [];
        if (!cancelled) {
          setModalEmployees(
            Array.isArray(employeesFromApi) ? employeesFromApi : [],
          );
        }
      } catch (error) {
        console.error("Error loading employees for request modal:", error);
        if (!cancelled) {
          setModalEmployees(Array.isArray(allEmployees) ? allEmployees : []);
        }
      } finally {
        if (!cancelled) {
          setTableLoading(false);
        }
      }
    };

    loadModalEmployees();

    return () => {
      cancelled = true;
    };
  }, [visible, allEmployees]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSitesLoading(true);

    const isDefaultCounterparty = userCounterpartyId === defaultCounterpartyId;

    if (isDefaultCounterparty) {
      constructionSiteService
        .getAll()
        .then((response) => {
          const rawSites =
            response?.data?.data?.constructionSites ||
            response?.data?.constructionSites ||
            [];
          setAvailableSites(Array.isArray(rawSites) ? rawSites : []);
        })
        .catch((error) => {
          console.error("Error loading construction sites:", error);
          setAvailableSites([]);
        })
        .finally(() => setSitesLoading(false));
      return;
    }

    if (!userCounterpartyId) {
      setAvailableSites([]);
      setSitesLoading(false);
      return;
    }

    constructionSiteService
      .getCounterpartyObjects(userCounterpartyId)
      .then((response) => {
        const rawSites = response?.data?.data || [];
        setAvailableSites(Array.isArray(rawSites) ? rawSites : []);
      })
      .catch((error) => {
        console.error("Error loading counterparty construction sites:", error);
        setAvailableSites([]);
      })
      .finally(() => setSitesLoading(false));
  }, [visible, userCounterpartyId, defaultCounterpartyId]);

  useEffect(() => {
    if (!(visible && userRole === "admin")) {
      return;
    }

    setCounterpartiesLoading(true);
    counterpartyService
      .getAll({ limit: 10000, page: 1 })
      .then((response) => {
        const rawCounterparties =
          response?.data?.data?.counterparties ||
          response?.data?.counterparties ||
          [];
        setAvailableCounterparties(
          Array.isArray(rawCounterparties) ? rawCounterparties : [],
        );
      })
      .catch((error) => {
        console.error("Error loading counterparties:", error);
        setAvailableCounterparties([]);
      })
      .finally(() => setCounterpartiesLoading(false));
  }, [visible, userRole]);

  useEffect(() => {
    if (!(visible && modalEmployees.length > 0)) {
      return;
    }

    const consentsMap = {};
    modalEmployees.forEach((employee) => {
      consentsMap[employee.id] = employee.files && employee.files.length > 0;
    });
    setEmployeesWithConsents(consentsMap);
  }, [visible, modalEmployees]);

  const availableEmployees = useMemo(() => {
    let filtered = modalEmployees;

    if (userRole === "user") {
      const isDefaultCounterparty =
        userCounterpartyId === defaultCounterpartyId;
      if (isDefaultCounterparty) {
        filtered = filtered.filter((employee) => employee.createdBy === userId);
      }
    } else if (userRole === "admin" && selectedCounterparty) {
      filtered = filtered.filter((employee) => {
        const counterpartyId =
          employee.employeeCounterpartyMappings?.[0]?.counterpartyId;
        return counterpartyId === selectedCounterparty;
      });
    }

    filtered = filtered.filter((employee) => {
      const priority = getStatusPriority(employee);
      if (priority === 1 || priority === 3) return false;
      if (employee.statusCard === "draft") return false;
      if (!includeFired && priority === 2) return false;
      return true;
    });

    if (selectedSite) {
      filtered = filtered.filter((employee) => {
        const siteIds =
          employee.employeeCounterpartyMappings
            ?.filter((mapping) => mapping.constructionSite)
            .map((mapping) => mapping.constructionSite?.id) || [];
        return siteIds.includes(selectedSite);
      });
    }

    return filtered;
  }, [
    modalEmployees,
    selectedSite,
    includeFired,
    selectedCounterparty,
    userRole,
    userCounterpartyId,
    userId,
    defaultCounterpartyId,
  ]);

  useEffect(() => {
    if (visible && availableEmployees.length > 0) {
      setSelectedEmployees(availableEmployees.map((employee) => employee.id));
      setAllSelected(true);
    }
  }, [visible, availableEmployees]);

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedEmployees(availableEmployees.map((employee) => employee.id));
      setAllSelected(true);
      return;
    }

    setSelectedEmployees([]);
    setAllSelected(false);
  };

  const rowSelection = {
    selectedRowKeys: selectedEmployees,
    onChange: (selectedRowKeys) => {
      setSelectedEmployees(selectedRowKeys);
      setAllSelected(selectedRowKeys.length === availableEmployees.length);
    },
  };

  const columns = useMemo(
    () => buildApplicationRequestModalColumns(employeesWithConsents),
    [employeesWithConsents],
  );

  const handleCreateRequest = async () => {
    if (selectedEmployees.length === 0) {
      messageApi.warning("Выберите хотя бы одного сотрудника для заявки");
      return;
    }

    try {
      setLoading(true);
      await applicationService.create({ employeeIds: selectedEmployees });

      const employeesToExport = availableEmployees.filter((employee) =>
        selectedEmployees.includes(employee.id),
      );

      const { rows, hasNumberColumn, activeColumnCount } =
        buildApplicationRequestExcelData({
          employees: employeesToExport,
          selectedColumns,
        });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const colWidths = [];
      if (hasNumberColumn) {
        colWidths.push({ wch: 6 });
      }
      Array.from({ length: activeColumnCount }).forEach(() => {
        colWidths.push({ wch: 20 });
      });
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Заявка");
      const fileName = `Заявка_${dayjs().format("DD-MM-YYYY_HH-mm")}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      messageApi.success(`Заявка создана и файл сохранен: ${fileName}`);
      onCancel();
    } catch (error) {
      console.error("Create request error:", error);
      messageApi.error("Ошибка при создании заявки");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadConsents = async () => {
    try {
      if (selectedEmployees.length === 0) {
        messageApi.warning("Выберите хотя бы одного сотрудника");
        return;
      }

      setDownloadingConsents(true);

      const createResponse = await applicationService.create({
        employeeIds: selectedEmployees,
      });
      const applicationId = createResponse.data.data.id;

      const response =
        await applicationService.downloadDeveloperBiometricConsents(
          applicationId,
          selectedEmployees,
        );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;

      const contentDisposition = response.headers["content-disposition"];
      let fileName = "согласия_перс_данные.zip";
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?([^"]*)"?/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = decodeURIComponent(fileNameMatch[1]);
        }
      }

      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      messageApi.success("Согласия выгружены");
    } catch (error) {
      console.error("Error downloading consents:", error);
      messageApi.error(
        error.response?.data?.message || "Ошибка при выгрузке согласий",
      );
    } finally {
      setDownloadingConsents(false);
    }
  };

  return {
    loading,
    tableLoading,
    sitesLoading,
    counterpartiesLoading,
    downloadingConsents,
    selectedEmployees,
    allSelected,
    selectedSite,
    setSelectedSite,
    selectedCounterparty,
    setSelectedCounterparty,
    includeFired,
    setIncludeFired,
    availableSites,
    availableCounterparties,
    isColumnsModalOpen,
    setIsColumnsModalOpen,
    pagination,
    setPagination,
    availableEmployees,
    handleSelectAll,
    rowSelection,
    columns,
    selectedColumns,
    updateColumns,
    toggleColumn,
    moveColumnUp,
    moveColumnDown,
    selectAll,
    deselectAll,
    handleCreateRequest,
    handleDownloadConsents,
  };
};
