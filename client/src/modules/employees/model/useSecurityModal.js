import { useCallback, useEffect, useMemo, useState } from "react";
import { employeeService } from "@/services/employeeService";
import { employeeStatusService } from "@/services/employeeStatusService";
import { counterpartyService } from "@/services/counterpartyService";

export const useSecurityModal = ({
  visible,
  onSuccess,
  messageApi,
}) => {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [counterparties, setCounterparties] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [selectedCounterparty, setSelectedCounterparty] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null); // null | "blocked" | "not_blocked"
  const [allStatuses, setAllStatuses] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const fetchAllStatuses = useCallback(async () => {
    try {
      const statuses = await employeeStatusService.getAllStatuses();
      setAllStatuses(statuses);
    } catch (error) {
      console.error("Error loading statuses:", error);
    }
  }, []);

  const fetchCounterparties = useCallback(async () => {
    try {
      const { data } = await counterpartyService.getAll({ limit: 10000, page: 1 });
      setCounterparties(data.data.counterparties || []);
    } catch (error) {
      console.error("Error loading counterparties:", error);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);

      const params = {
        page,
        limit: pageSize,
        search: searchText || undefined,
        counterpartyId: selectedCounterparty || undefined,
      };
      if (statusFilter === "blocked") params.statuses = ["blocked"];
      if (statusFilter === "tb_passed") params.statuses = ["tb_passed"];
      if (statusFilter === "tb_not_passed") params.statuses = ["tb_not_passed"];

      const response = await employeeService.getAll(params);
      let pageEmployees = response.data.employees || [];
      const serverTotal = response.data.pagination?.total || pageEmployees.length;

      if (pageEmployees.length > 0) {
        try {
          const ids = pageEmployees.map((e) => e.id);
          const statusesBatch = await employeeStatusService.getStatusesBatch(ids);
          pageEmployees = pageEmployees.map((e) => ({
            ...e,
            statusMappings: statusesBatch[e.id] || [],
          }));
        } catch (err) {
          console.warn("Error loading statuses batch:", err);
        }
      }

      // "not_blocked" нет в серверных фильтрах — фильтруем на клиенте по текущей странице
      if (statusFilter === "not_blocked") {
        pageEmployees = pageEmployees.filter((e) => {
          const secureStatus = e.statusMappings?.find(
            (m) => m.statusGroup === "status_secure" || m.status_group === "status_secure",
          )?.status?.name;
          return secureStatus !== "status_secure_block" && secureStatus !== "status_secure_block_compl";
        });
      }

      setEmployees(pageEmployees);
      setTotal(statusFilter === "not_blocked" ? pageEmployees.length : serverTotal);
    } catch (error) {
      console.error("Error fetching employees:", error);
      messageApi.error("Ошибка при загрузке сотрудников");
    } finally {
      setLoading(false);
    }
  }, [messageApi, searchText, selectedCounterparty, statusFilter, page, pageSize]);

  useEffect(() => {
    if (visible) {
      fetchCounterparties();
      fetchAllStatuses();
    }
  }, [visible, fetchAllStatuses, fetchCounterparties]);

  useEffect(() => {
    if (visible) {
      fetchEmployees();
    }
  }, [visible, fetchEmployees]);

  // Сбрасываем страницу при изменении фильтров
  useEffect(() => {
    setPage(1);
  }, [searchText, selectedCounterparty, statusFilter]);

  const handleBlock = async (employeeId) => {
    try {
      const blockStatus = allStatuses.find((s) => s.name === "status_secure_block");
      if (!blockStatus) throw new Error("Статус блокировки не найден");
      await employeeStatusService.setStatus(employeeId, blockStatus.id);
      messageApi.success("Сотрудник заблокирован");
      onSuccess?.();
      fetchEmployees();
    } catch (error) {
      console.error("Error blocking employee:", error);
      messageApi.error("Ошибка при блокировке сотрудника");
    }
  };

  const handleUnblock = async (employeeId) => {
    try {
      const allowStatus = allStatuses.find((s) => s.name === "status_secure_allow");
      if (!allowStatus) throw new Error("Статус разблокировки не найден");
      await employeeStatusService.setStatus(employeeId, allowStatus.id);
      messageApi.success("Сотрудник разблокирован");
      onSuccess?.();
      fetchEmployees();
    } catch (error) {
      console.error("Error unblocking employee:", error);
      messageApi.error("Ошибка при разблокировке сотрудника");
    }
  };

  const tablePagination = useMemo(
    () => ({
      current: page,
      pageSize,
      total,
      showSizeChanger: true,
      pageSizeOptions: [50, 100, 200],
      onChange: (p, ps) => {
        setPage(p);
        setPageSize(ps);
      },
    }),
    [page, pageSize, total],
  );

  return {
    loading,
    employees,
    counterparties,
    searchText,
    setSearchText,
    selectedCounterparty,
    setSelectedCounterparty,
    statusFilter,
    setStatusFilter,
    handleBlock,
    handleUnblock,
    tablePagination,
  };
};
