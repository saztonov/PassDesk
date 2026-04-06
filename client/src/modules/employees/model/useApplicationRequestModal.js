import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { useExcelColumns } from "@/hooks/useExcelColumns";
import { applicationService } from "@/services/applicationService";
import { constructionSiteService } from "@/services/constructionSiteService";
import { counterpartyService } from "@/services/counterpartyService";
import { buildApplicationRequestExcelData } from "@/modules/employees/lib/applicationRequestModalFormatters";
import { buildApplicationRequestModalColumns } from "@/modules/employees/ui/ApplicationRequestModalColumns";

export const useApplicationRequestModal = ({
  visible,
  userRole,
  userCounterpartyId,
  defaultCounterpartyId,
  userId,
  onCancel,
  messageApi,
}) => {
  const [loading, setLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [counterpartiesLoading, setCounterpartiesLoading] = useState(false);
  const [downloadingConsents, setDownloadingConsents] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedCounterparty, setSelectedCounterparty] = useState(null);
  const [includeFired, setIncludeFired] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);
  const [availableCounterparties, setAvailableCounterparties] = useState([]);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 100 });
  const [employeesWithConsents, setEmployeesWithConsents] = useState({});
  const [loadedEmployeesById, setLoadedEmployeesById] = useState({});
  const [modalEmployees, setModalEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [hasLoadedEmployees, setHasLoadedEmployees] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const {
    columns: selectedColumns,
    updateColumns,
    toggleColumn,
    moveColumnUp,
    moveColumnDown,
    selectAll,
    deselectAll,
  } = useExcelColumns();

  const employeeRequestParams = useMemo(() => {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
      statuses: JSON.stringify(
        includeFired ? ["active", "draft", "fired"] : ["active", "draft"],
      ),
    };

    if (selectedCounterparty) {
      params.counterpartyId = selectedCounterparty;
    }

    if (selectedSite) {
      params.constructionSiteId = selectedSite;
    }

    return params;
  }, [
    includeFired,
    pagination.current,
    pagination.pageSize,
    selectedCounterparty,
    selectedSite,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;

    const loadEmployees = async () => {
      setEmployeesLoading(true);
      setHasLoadedEmployees(false);
      try {
        const response = await applicationService.getRequestEmployees(
          employeeRequestParams,
        );
        const responseData = response?.data?.data || {};
        const nextEmployees = Array.isArray(responseData.employees)
          ? responseData.employees
          : [];
        const total = Number(responseData?.pagination?.total) || 0;

        if (cancelled) {
          return;
        }

        setModalEmployees(nextEmployees);
        setTotalCount(total);
        setHasLoadedEmployees(true);
      } catch (error) {
        console.error("Error loading employees for application request:", error);
        if (!cancelled) {
          setModalEmployees([]);
          setTotalCount(0);
          setHasLoadedEmployees(true);
          messageApi.error("Ошибка загрузки сотрудников");
        }
      } finally {
        if (!cancelled) {
          setEmployeesLoading(false);
        }
      }
    };

    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [visible, employeeRequestParams, messageApi]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSitesLoading(true);

    const loadSites = async () => {
      try {
        const loadAllConstructionSites = async () => {
          const items = [];
          let currentPage = 1;
          let totalPages = 1;

          while (currentPage <= totalPages) {
            const response = await constructionSiteService.getAll({
              page: currentPage,
              limit: 100,
            });
            const data = response?.data?.data || {};
            const pageItems = Array.isArray(data.constructionSites)
              ? data.constructionSites
              : [];
            const pages = Number(data?.pagination?.pages) || 1;

            items.push(...pageItems);
            totalPages = pages;
            currentPage += 1;
          }

          return items;
        };

        const shouldScopeByUserCounterparty =
          userRole === "user" &&
          userCounterpartyId &&
          userCounterpartyId !== defaultCounterpartyId;
        const effectiveCounterpartyId = selectedCounterparty
          || (shouldScopeByUserCounterparty ? userCounterpartyId : null);
        const isDefaultScope =
          !selectedCounterparty &&
          !shouldScopeByUserCounterparty;

        const nextSites =
          effectiveCounterpartyId && !isDefaultScope
            ? (() => {
                const responsePromise =
                  counterpartyService.getConstructionSites(
                    effectiveCounterpartyId,
                  );
                return responsePromise.then((response) => {
                  const scopedSites =
                    response?.data?.data?.constructionSites ||
                    response?.data?.constructionSites ||
                    response?.data?.data ||
                    [];
                  return Array.isArray(scopedSites) ? scopedSites : [];
                });
              })()
            : loadAllConstructionSites();

        const resolvedSites = await nextSites;

        setAvailableSites(resolvedSites);
        setSelectedSite((current) =>
          resolvedSites.some((site) => site.id === current) ? current : null,
        );
      } catch (error) {
        console.error("Error loading construction sites:", error);
        setAvailableSites([]);
        setSelectedSite(null);
      } finally {
        setSitesLoading(false);
      }
    };

    loadSites();
  }, [
    visible,
    userRole,
    selectedCounterparty,
    userCounterpartyId,
    defaultCounterpartyId,
  ]);

  useEffect(() => {
    if (!(visible && userRole !== "user")) {
      return;
    }

    setCounterpartiesLoading(true);
    counterpartyService
      .getAvailable()
      .then((response) => {
        const rawCounterparties =
          response?.data?.data?.counterparties ||
          response?.data?.counterparties ||
          response?.data?.data ||
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

    setEmployeesWithConsents((prev) => {
      const next = { ...prev };
      modalEmployees.forEach((employee) => {
        next[employee.id] =
          Array.isArray(employee.files) && employee.files.length > 0;
      });
      return next;
    });
  }, [visible, modalEmployees]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setLoadedEmployeesById((prev) => {
      const next = { ...prev };
      modalEmployees.forEach((employee) => {
        next[employee.id] = employee;
      });
      return next;
    });
  }, [visible, modalEmployees]);

  const availableEmployees = modalEmployees;

  useEffect(() => {
    if (!visible) {
      return;
    }

    setPagination((prev) => ({
      ...prev,
      current: 1,
    }));
    setSelectedEmployees([]);
    setLoadedEmployeesById({});
    setEmployeesWithConsents({});
    setHasLoadedEmployees(false);
  }, [visible, selectedCounterparty, selectedSite, includeFired]);

  const currentPageEmployeeIds = useMemo(
    () => availableEmployees.map((employee) => employee.id),
    [availableEmployees],
  );

  const allSelected =
    currentPageEmployeeIds.length > 0 &&
    currentPageEmployeeIds.every((employeeId) =>
      selectedEmployees.includes(employeeId),
    );

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedEmployees((prev) =>
        Array.from(new Set([...prev, ...currentPageEmployeeIds])),
      );
      return;
    }

    setSelectedEmployees((prev) =>
      prev.filter((employeeId) => !currentPageEmployeeIds.includes(employeeId)),
    );
  };

  const rowSelection = {
    preserveSelectedRowKeys: true,
    selectedRowKeys: selectedEmployees,
    onChange: (selectedRowKeys) => {
      setSelectedEmployees(selectedRowKeys);
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

      const employeesToExport = Object.values(loadedEmployeesById).filter(
        (employee) => selectedEmployees.includes(employee.id),
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

      const employeeIdsWithConsents = selectedEmployees.filter((employeeId) =>
        Array.isArray(loadedEmployeesById[employeeId]?.files) &&
        loadedEmployeesById[employeeId].files.length > 0,
      );

      if (employeeIdsWithConsents.length === 0) {
        messageApi.warning(
          "У выбранных сотрудников нет согласий на обработку перс. данных",
        );
        return;
      }

      setDownloadingConsents(true);

      const createResponse = await applicationService.create({
        employeeIds: employeeIdsWithConsents,
      });
      const applicationId = createResponse.data.data.id;

      const response =
        await applicationService.downloadDeveloperBiometricConsents(
          applicationId,
          employeeIdsWithConsents,
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
    tableLoading: employeesLoading || (visible && !hasLoadedEmployees),
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
    pagination: {
      ...pagination,
      total: totalCount,
    },
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
