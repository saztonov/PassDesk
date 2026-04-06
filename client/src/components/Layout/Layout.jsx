import { Outlet } from "react-router-dom";
import { Layout as AntLayout, Grid } from "antd";
import Sidebar from "./Sidebar";
import Header from "./Header";

const { Content } = AntLayout;
const { useBreakpoint } = Grid;

const Layout = () => {
  const screens = useBreakpoint();
  const isMobile = !screens.md; // md = 768px

  return (
    <AntLayout style={{ height: "100vh", overflow: "hidden" }}>
      {/* Desktop - показываем Sidebar */}
      {!isMobile && <Sidebar />}

      <AntLayout style={{ overflow: "hidden", borderRadius: 10 }}>
        {isMobile && <Header />}
        <Content
          style={{
            height: isMobile ? "calc(100vh - 64px)" : "100vh",
            overflowY: "auto", // Скролл в контенте
            overflowX: "hidden",
            background: "#f0f2f5", // Фон как у Ant Design
            padding: 20,
            margin: 0, // БЕЗ margin
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
