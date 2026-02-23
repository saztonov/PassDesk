import { useCallback, useEffect } from "react";

export const useEmployeeFormTabFlow = ({
  requiresPatent,
  checkingCitizenship,
  activeTab,
  setActiveTab,
  visible,
  requiredFieldsByTab,
  tabsValidation,
}) => {
  useEffect(() => {
    if (checkingCitizenship) return;

    if (!requiresPatent && activeTab === "3") {
      setActiveTab("1");
    }
  }, [requiresPatent, activeTab, checkingCitizenship, visible, setActiveTab]);

  const allTabsValid = useCallback(() => {
    const requiredTabs = Object.keys(requiredFieldsByTab);
    return requiredTabs.every((tabKey) => tabsValidation[tabKey] === true);
  }, [requiredFieldsByTab, tabsValidation]);

  const handleNext = useCallback(() => {
    const tabOrder = Object.keys(requiredFieldsByTab).sort((a, b) => {
      const left = Number(a);
      const right = Number(b);
      if (Number.isNaN(left) || Number.isNaN(right)) {
        return a.localeCompare(b);
      }
      return left - right;
    });
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex < tabOrder.length - 1) {
      setActiveTab(tabOrder[currentIndex + 1]);
    }
  }, [activeTab, requiredFieldsByTab, setActiveTab]);

  return {
    allTabsValid,
    handleNext,
  };
};
