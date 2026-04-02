import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Tabs, Typography, Space } from "antd";
import {
  BookOutlined,
  ApartmentOutlined,
  TeamOutlined,
  ShopOutlined,
  BankOutlined,
} from "@ant-design/icons";
import CounterpartiesPage from "./CounterpartiesPage";
import ConstructionSitesPage from "./ConstructionSitesPage";
import DepartmentsPage from "./DepartmentsPage";
import PositionsPage from "./PositionsPage";
import { useAuthStore } from "@/store/authStore";

const { Title } = Typography;

const DIRECTORY_TAB_KEYS = [
  "counterparties",
  "construction-sites",
  "departments",
  "positions",
];

const resolveInitialTab = (tabFromQuery, allowedTabKeys) => {
  if (allowedTabKeys.includes(tabFromQuery)) {
    return tabFromQuery;
  }

  const savedTab = localStorage.getItem("directoriesActiveTab");
  if (allowedTabKeys.includes(savedTab)) {
    return savedTab;
  }

  return allowedTabKeys[0] || "counterparties";
};

const DirectoriesPage = () => {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromQuery = searchParams.get("tab");
  const isOtRole = user?.role === "ot_admin" || user?.role === "ot_engineer";
  const allowedTabKeys = useMemo(
    () => (isOtRole ? ["counterparties"] : DIRECTORY_TAB_KEYS),
    [isOtRole],
  );
  const activeTab = useMemo(
    () => resolveInitialTab(tabFromQuery, allowedTabKeys),
    [allowedTabKeys, tabFromQuery],
  );

  useEffect(() => {
    localStorage.setItem("directoriesActiveTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (tabFromQuery === activeTab || !allowedTabKeys.includes(activeTab)) {
      return;
    }
    setSearchParams({ tab: activeTab }, { replace: true });
  }, [activeTab, allowedTabKeys, setSearchParams, tabFromQuery]);

  const handleTabChange = useCallback(
    (nextTab) => {
      if (!allowedTabKeys.includes(nextTab)) {
        return;
      }
      setSearchParams({ tab: nextTab }, { replace: false });
    },
    [allowedTabKeys, setSearchParams],
  );

  const tabItems = useMemo(() => {
    const allItems = [
      {
        key: "counterparties",
        label: (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ShopOutlined />
            <span>Контрагенты</span>
          </span>
        ),
        children: <CounterpartiesPage />,
      },
      {
        key: "construction-sites",
        label: (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <BankOutlined />
            <span>Объекты строительства</span>
          </span>
        ),
        children: <ConstructionSitesPage />,
      },
      {
        key: "departments",
        label: (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ApartmentOutlined />
            <span>Подразделения</span>
          </span>
        ),
        children: <DepartmentsPage />,
      },
      {
        key: "positions",
        label: (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <TeamOutlined />
            <span>Должности</span>
          </span>
        ),
        children: <PositionsPage />,
      },
    ];

    return allItems.filter((item) => allowedTabKeys.includes(item.key));
  }, [allowedTabKeys]);

  return (
    <div
      style={{
        padding: "0",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <style>{`
        .directories-tabs .ant-tabs-content-holder {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .directories-tabs .ant-tabs-content {
          height: 100%;
        }
        .directories-tabs .ant-tabs-tabpane {
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
      `}</style>
      <Card
        title={
          <Space>
            <BookOutlined />
            <Title level={3} style={{ margin: 0 }}>
              Справочники
            </Title>
          </Space>
        }
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          margin: 0,
          padding: 0,
        }}
        styles={{
          body: {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
            padding: 0,
          },
        }}
      >
        <Tabs
          className="directories-tabs"
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          size="large"
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
            margin: 0,
          }}
          tabBarStyle={{
            margin: 0,
            borderBottom: "1px solid #f0f0f0",
            flexShrink: 0,
            paddingLeft: "10px",
          }}
        />
      </Card>
    </div>
  );
};

export default DirectoriesPage;
