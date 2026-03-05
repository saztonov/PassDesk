import { Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import ruRU from "antd/locale/ru_RU";
import { antdTheme } from "./theme/antd-theme";
import Layout from "./components/Layout/Layout";
import LoginPage from "./pages/LoginPage";
import BlockedAccountPage from "./pages/BlockedAccountPage";
import ProfilePage from "./pages/ProfilePage";
import EmployeesPage from "./pages/employees";
import AddEmployeePage from "./pages/employees/AddEmployeePage";
import ApplicationRequestPage from "./pages/employees/ApplicationRequestPage";
import PassesPage from "./pages/PassesPage";
import CounterpartiesPage from "./pages/CounterpartiesPage";
import CounterpartyDocumentsPage from "./pages/CounterpartyDocumentsPage";
import UserProfilePage from "./pages/UserProfilePage";
import AdministrationPage from "./pages/AdministrationPage";
import SkudPage from "./pages/SkudPage";
import DirectoriesPage from "./pages/DirectoriesPage";
import DebugPage from "./pages/DebugPage";
import NotFoundPage from "./pages/NotFoundPage";
import OccupationalSafetyPage from "./pages/OccupationalSafetyPage";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { useAuthStore } from "./store/authStore";
import { useEffect, useState } from "react";
import { setLanguage } from "./i18n";
import settingsService from "./services/settingsService";

// Компонент для перенаправления на employees для всех ролей
const RoleBasedRedirect = () => {
  return <Navigate to="/employees" replace />;
};

function App() {
  useAuthBootstrap();
  // Автоматически обновляем токен в фоне каждые 30 секунд
  useTokenRefresh();
  const { user } = useAuthStore();
  const [defaultCounterpartyId, setDefaultCounterpartyId] = useState(null);

  useEffect(() => {
    const loadDefaultCounterpartyId = async () => {
      try {
        const response = await settingsService.getPublicSettings();
        if (response.success && response.data.defaultCounterpartyId) {
          setDefaultCounterpartyId(response.data.defaultCounterpartyId);
        }
      } catch (error) {
        console.error("Error loading default counterparty ID:", error);
      }
    };

    loadDefaultCounterpartyId();
  }, []);

  useEffect(() => {
    if (user?.userLanguage) {
      setLanguage(user.userLanguage);
    }
  }, [user?.userLanguage]);

  const isDefaultCounterpartyUser =
    user?.role === "user" &&
    user?.counterpartyId &&
    defaultCounterpartyId &&
    String(user.counterpartyId) === String(defaultCounterpartyId);

  return (
    <ConfigProvider theme={antdTheme} locale={ruRU}>
      <AntApp>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/blocked" element={<BlockedAccountPage />} />
          <Route path="/debug" element={<DebugPage />} />

          {/* Protected routes с Layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute requiresActivation={false}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RoleBasedRedirect />} />

            {/* Profile route - доступен всем авторизованным (даже неактивным) */}
            <Route path="profile" element={<ProfilePage />} />

            {/* Routes for admin and user - требуют активации */}
            <Route
              path="employees"
              element={
                <ProtectedRoute allowedRoles={["admin", "user"]}>
                  <EmployeesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="employees/add"
              element={
                <ProtectedRoute allowedRoles={["admin", "user"]}>
                  <AddEmployeePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="employees/edit/:id"
              element={
                <ProtectedRoute allowedRoles={["admin", "user"]}>
                  <AddEmployeePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="employees/request"
              element={
                <ProtectedRoute allowedRoles={["admin", "user"]}>
                  <ApplicationRequestPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="passes"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <PassesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="counterparties"
              element={
                <ProtectedRoute allowedRoles={["admin", "user"]}>
                  {user?.role === "admin" ? (
                    <Navigate to="/directories?tab=counterparties" replace />
                  ) : (
                    <CounterpartiesPage />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="construction-sites"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Navigate to="/directories?tab=construction-sites" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="contracts"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Navigate to="/directories?tab=contracts" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="counterparty-documents"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager", "user"]}>
                  <CounterpartyDocumentsPage />
                </ProtectedRoute>
              }
            />
            {/* Route for directories (admin only) */}
            <Route
              path="directories"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <DirectoriesPage />
                </ProtectedRoute>
              }
            />

            {/* Route for admin only */}
            <Route
              path="administration"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdministrationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="skud"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager"]}>
                  <SkudPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="ot"
              element={
                <ProtectedRoute
                  allowedRoles={["admin", "user", "ot_engineer", "ot_admin"]}
                >
                  {isDefaultCounterpartyUser ? (
                    <Navigate to="/employees" replace />
                  ) : (
                    <OccupationalSafetyPage />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdministrationPage />
                </ProtectedRoute>
              }
            />

            {/* Route for regular users (employee profile) */}
            <Route path="my-profile" element={<UserProfilePage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
