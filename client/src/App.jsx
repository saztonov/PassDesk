import { Routes, Route, Navigate } from "react-router-dom";
import { Button, ConfigProvider, App as AntApp, Result, Spin } from "antd";
import ruRU from "antd/locale/ru_RU";
import { antdTheme } from "./theme/antd-theme";
import ProtectedRoute from "./components/Auth/ProtectedRoute";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { useAuthStore } from "./store/authStore";
import { Suspense, lazy, useEffect, useState } from "react";
import { setLanguage } from "./i18n";
import settingsService from "./services/settingsService";
import ErrorBoundary from "./shared/ui/ErrorBoundary";

const Layout = lazy(() => import("./components/Layout/Layout"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const BlockedAccountPage = lazy(() => import("./pages/BlockedAccountPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const EmployeesPage = lazy(() => import("./pages/employees"));
const AddEmployeePage = lazy(() => import("./pages/employees/AddEmployeePage"));
const ApplicationRequestPage = lazy(() => import("./pages/employees/ApplicationRequestPage"));
const DocumentCaptureDebugPage = lazy(() =>
  import("./pages/employees/DocumentCaptureDebugPage")
);
const ExistingEmployeeOcrPage = lazy(() =>
  import("./pages/employees/ExistingEmployeeOcrPage")
);
const LaborerCabinetPage = lazy(() => import("./pages/employees/LaborerCabinetPage"));
const CounterpartiesPage = lazy(() => import("./pages/CounterpartiesPage"));
const CounterpartyDocumentsPage = lazy(() => import("./pages/CounterpartyDocumentsPage"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"));
const AdministrationPage = lazy(() => import("./pages/AdministrationPage"));
const SkudPage = lazy(() => import("./pages/SkudPage"));
const SkudEmployeeEventsPage = lazy(() => import("./pages/SkudEmployeeEventsPage"));
const DirectoriesPage = lazy(() => import("./pages/DirectoriesPage"));
const DebugPage = lazy(() => import("./pages/DebugPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const OccupationalSafetyPage = lazy(() => import("./pages/OccupationalSafetyPage"));
const QrAccessPage = lazy(() => import("./pages/QrAccessPage"));

const RouteFallback = () => (
  <div
    style={{
      minHeight: "50vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Spin size="large" />
  </div>
);

const RouteErrorFallback = ({ onRetry }) => (
  <div
    style={{
      minHeight: "50vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}
  >
    <Result
      status="error"
      title="Страница временно недоступна"
      subTitle="Произошла ошибка интерфейса. Попробуйте повторить действие."
      extra={(
        <Button type="primary" onClick={onRetry}>
          Повторить
        </Button>
      )}
    />
  </div>
);

const withRouteBoundary = (name, element) => (
  <ErrorBoundary
    onError={(error, errorInfo) => {
      console.error(
        `UI boundary error [${name}]`,
        error,
        errorInfo?.componentStack || "",
      );
    }}
    fallback={({ resetError }) => (
      <RouteErrorFallback onRetry={resetError} />
    )}
  >
    {element}
  </ErrorBoundary>
);

const RoleBasedRedirect = () => {
  const { user } = useAuthStore();

  if (user?.role === "laborer") {
    return <Navigate to="/cabinet" replace />;
  }

  if (user?.role === "ot_engineer" || user?.role === "ot_admin") {
    return <Navigate to="/ot" replace />;
  }

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
  const isDebugRoutesEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_ROUTES === "true";

  return (
    <ConfigProvider theme={antdTheme} locale={ruRU}>
      <AntApp>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public routes */}
            <Route
              path="/login"
              element={withRouteBoundary("login-page", <LoginPage />)}
            />
            <Route
              path="/blocked"
              element={withRouteBoundary("blocked-account-page", <BlockedAccountPage />)}
            />
            {isDebugRoutesEnabled && (
              <Route
                path="/debug"
                element={withRouteBoundary("debug-page", <DebugPage />)}
              />
            )}

            {/* Protected routes с Layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute requiresActivation={false}>
                  {withRouteBoundary("layout", <Layout />)}
                </ProtectedRoute>
              }
            >
              <Route index element={<RoleBasedRedirect />} />

              {/* Profile route - доступен всем авторизованным (даже неактивным) */}
              <Route
                path="profile"
                element={withRouteBoundary(
                  "profile-page",
                  user?.role === "laborer" && user?.isActive ? (
                    <Navigate to="/cabinet" replace />
                  ) : (
                    <ProfilePage />
                  )
                )}
              />

              <Route
                path="cabinet"
                element={withRouteBoundary(
                  "laborer-cabinet-page",
                  <ProtectedRoute allowedRoles={["laborer"]}>
                    <LaborerCabinetPage />
                  </ProtectedRoute>
                )}
              />

              {/* Routes for admin and user - требуют активации */}
              <Route
                path="qr-access"
                element={withRouteBoundary(
                  "qr-access-page",
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <QrAccessPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="employees"
                element={withRouteBoundary(
                  "employees-page",
                  <ProtectedRoute allowedRoles={["admin", "manager", "user"]}>
                    <EmployeesPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="employees/add"
                element={withRouteBoundary(
                  "employees-add-page",
                  <ProtectedRoute allowedRoles={["admin", "manager", "user"]}>
                    <AddEmployeePage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="employees/edit/:id"
                element={withRouteBoundary(
                  "employees-edit-page",
                  <ProtectedRoute allowedRoles={["admin", "manager", "user"]}>
                    <AddEmployeePage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="employees/request"
                element={withRouteBoundary(
                  "employees-request-page",
                  <ProtectedRoute allowedRoles={["admin", "manager", "user"]}>
                    <ApplicationRequestPage />
                  </ProtectedRoute>
                )}
              />
              {isDebugRoutesEnabled && (
                <Route
                  path="employees/debug/document-capture"
                  element={withRouteBoundary(
                    "employees-debug-document-capture-page",
                    <ProtectedRoute allowedRoles={["admin", "manager"]}>
                      <DocumentCaptureDebugPage />
                    </ProtectedRoute>
                  )}
                />
              )}
              {isDebugRoutesEnabled && (
                <Route
                  path="employees/debug/existing-ocr"
                  element={withRouteBoundary(
                    "employees-debug-existing-ocr-page",
                    <ProtectedRoute allowedRoles={["admin", "manager"]}>
                      <ExistingEmployeeOcrPage />
                    </ProtectedRoute>
                  )}
                />
              )}
              <Route
                path="passes"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <Navigate to="/skud?tab=employees" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="counterparties"
                element={withRouteBoundary(
                  "counterparties-page",
                  <ProtectedRoute allowedRoles={["admin", "manager", "user"]}>
                    {user?.role === "admin" || user?.role === "manager" ? (
                      <Navigate to="/directories?tab=counterparties" replace />
                    ) : (
                      <CounterpartiesPage />
                    )}
                  </ProtectedRoute>
                )}
              />
              <Route
                path="construction-sites"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <Navigate to="/directories?tab=construction-sites" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="contracts"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
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
                element={withRouteBoundary(
                  "directories-page",
                  <ProtectedRoute
                    allowedRoles={["admin", "manager", "ot_admin"]}
                  >
                    <DirectoriesPage />
                  </ProtectedRoute>
                )}
              />

              {/* Route for admin only */}
              <Route
                path="administration"
                element={withRouteBoundary(
                  "administration-page",
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AdministrationPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="skud"
                element={withRouteBoundary(
                  "skud-page",
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <SkudPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="skud/employee-events"
                element={withRouteBoundary(
                  "skud-employee-events-page",
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <SkudEmployeeEventsPage />
                  </ProtectedRoute>
                )}
              />
              <Route
                path="ot"
                element={withRouteBoundary(
                  "occupational-safety-page",
                  <ProtectedRoute
                    allowedRoles={[
                      "admin",
                      "user",
                      "ot_engineer",
                      "ot_admin",
                    ]}
                  >
                    {isDefaultCounterpartyUser ? (
                      <Navigate to="/employees" replace />
                    ) : (
                      <OccupationalSafetyPage />
                    )}
                  </ProtectedRoute>
                )}
              />
              <Route
                path="admin"
                element={withRouteBoundary(
                  "admin-page",
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AdministrationPage />
                  </ProtectedRoute>
                )}
              />

              {/* Route for regular users (employee profile) */}
              <Route
                path="my-profile"
                element={withRouteBoundary(
                  "user-profile-page",
                  <ProtectedRoute allowedRoles={["admin", "manager", "user"]}>
                    <UserProfilePage />
                  </ProtectedRoute>
                )}
              />
            </Route>

            {/* 404 */}
            <Route
              path="*"
              element={withRouteBoundary("not-found-page", <NotFoundPage />)}
            />
          </Routes>
        </Suspense>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
