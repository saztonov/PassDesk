import { useEffect, useState } from "react";
import { counterpartyService } from "@/services/counterpartyService";

export const useCounterpartyMap = ({ user, defaultCounterpartyId }) => {
  const [counterpartyMap, setCounterpartyMap] = useState({});
  const [counterpartyOptions, setCounterpartyOptions] = useState([]);
  const [hasSubcontractors, setHasSubcontractors] = useState(false);

  useEffect(() => {
    const loadCounterparties = async () => {
      try {
        const isAdmin = user?.role === "admin";
        const response = isAdmin
          ? await counterpartyService.getAll({
              limit: 10000,
              page: 1,
            })
          : await counterpartyService.getAvailable();

        const counterparties = isAdmin
          ? response?.data?.data?.counterparties ||
            response?.data?.counterparties ||
            []
          : response?.data?.data || [];

        const nextMap = {};
        counterparties.forEach((counterparty) => {
          if (counterparty.name) {
            nextMap[counterparty.name] = counterparty.id;
          }
        });
        setCounterpartyMap(nextMap);
        setCounterpartyOptions(
          counterparties
            .filter((counterparty) => counterparty?.id && counterparty?.name)
            .map((counterparty) => ({
              value: counterparty.id,
              label: counterparty.name,
            })),
        );

        if (
          user?.counterpartyId &&
          user.counterpartyId !== defaultCounterpartyId
        ) {
          setHasSubcontractors(counterparties.length > 1);
        } else {
          setHasSubcontractors(false);
        }
      } catch (error) {
        console.warn("Ошибка загрузки контрагентов:", error);
      }
    };

    if (defaultCounterpartyId !== undefined) {
      loadCounterparties();
    }
  }, [user?.role, user?.counterpartyId, defaultCounterpartyId]);

  return {
    counterpartyMap,
    counterpartyOptions,
    hasSubcontractors,
  };
};
