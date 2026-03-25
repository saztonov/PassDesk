import { useEffect, useState } from "react";
import { counterpartyService } from "@/services/counterpartyService";

export const useCounterpartyMap = ({ user, defaultCounterpartyId }) => {
  const [counterpartyMap, setCounterpartyMap] = useState({});
  const [counterpartyOptions, setCounterpartyOptions] = useState([]);
  const [hasSubcontractors, setHasSubcontractors] = useState(false);

  useEffect(() => {
    const loadCounterparties = async () => {
      try {
        let counterparties = [];

        try {
          const response = await counterpartyService.getAll({
            limit: 10000,
            page: 1,
          });
          counterparties =
            response?.data?.data?.counterparties ||
            response?.data?.counterparties ||
            [];
        } catch (error) {
          if (error?.response?.status && error.response.status !== 403) {
            throw error;
          }
        }

        if (counterparties.length === 0) {
          const response = await counterpartyService.getAvailable();
          counterparties = response?.data?.data || [];
        }

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
        setCounterpartyMap({});
        setCounterpartyOptions([]);
        setHasSubcontractors(false);
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
