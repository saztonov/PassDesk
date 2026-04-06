import { useCallback, useEffect, useMemo, useState } from "react";
import { employeeApi } from "@/entities/employee";

const EMPTY_STATS = Object.freeze({
  period: "day",
  range: {
    from: null,
    to: null,
  },
  portalCreated: 0,
  zupUploaded: 0,
});

export const useEmployeesPortalStats = ({
  period = "day",
  counterpartyIds = [],
} = {}) => {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(false);

  const normalizedCounterpartyIds = useMemo(
    () =>
      [...new Set((counterpartyIds || []).filter(Boolean).map((value) => String(value)))].sort(),
    [counterpartyIds],
  );

  const loadStats = useCallback(async () => {
    setLoading(true);

    try {
      const response = await employeeApi.getPortalStats({
        period,
        counterpartyIds: normalizedCounterpartyIds,
      });
      const payload = response?.data || {};

      setStats({
        period: payload?.period || period,
        range: {
          from: payload?.range?.from || null,
          to: payload?.range?.to || null,
        },
        portalCreated: Number(payload?.stats?.portalCreated || 0),
        zupUploaded: Number(payload?.stats?.zupUploaded || 0),
      });
    } catch (error) {
      console.error("Error fetching employees portal stats:", error);
      setStats({
        ...EMPTY_STATS,
        period,
      });
    } finally {
      setLoading(false);
    }
  }, [normalizedCounterpartyIds, period]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    stats,
    loading,
    refetch: loadStats,
  };
};

export default useEmployeesPortalStats;
