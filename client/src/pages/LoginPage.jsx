import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Form, Input, Button, Card, Typography, Tabs, App } from "antd";
import {
  UserOutlined,
  LockOutlined,
  LoginOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { useAuthStore } from "@/store/authStore";
import { forbiddenPasswordValidator } from "@/utils/forbiddenPasswords";
import { useTranslation } from "react-i18next";
import api from "@/services/api";

const { Title, Text, Link } = Typography;

const INSTRUCTION_URL =
  "https://docs.google.com/document/d/12wNHmIGNUcLjdDeThLY-77F_ARR1o2hKF_CIWhauy88/edit?usp=sharing";

const AuthPageLayout = ({
  icon,
  title,
  subtitle,
  subtitleExtra,
  children,
  footerText,
}) => (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      padding: "20px",
    }}
  >
    <Card
      style={{
        width: "100%",
        maxWidth: 500,
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              background: "#2563eb",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </div>
          <Title level={2} style={{ margin: 0 }}>
            {title}
          </Title>
        </div>
        <div style={{ textAlign: "center" }}>
          <Text type="secondary">{subtitle}</Text>
          {subtitleExtra ? (
            <div style={{ marginTop: 6 }}>
              <Text strong style={{ fontSize: 14 }}>
                {subtitleExtra}
              </Text>
            </div>
          ) : null}
        </div>
      </div>

      {children}

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <Link href={INSTRUCTION_URL} target="_blank">
            {footerText.instruction}
          </Link>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {footerText.copyright}
        </Text>
      </div>
    </Card>
  </div>
);

const LoginFormSection = ({ form, t, loading, onFinish }) => (
  <Form
    form={form}
    name="login"
    onFinish={onFinish}
    layout="vertical"
    requiredMark={false}
    autoComplete="off"
  >
    <Form.Item
      name="email"
      label={t("auth.email")}
      rules={[
        { required: true, message: t("auth.emailRequired") },
        { type: "email", message: t("auth.invalidEmail") },
      ]}
    >
      <Input
        prefix={<UserOutlined />}
        placeholder="user@example.com"
        size="large"
        autoComplete="off"
      />
    </Form.Item>

    <Form.Item
      name="password"
      label={t("auth.password")}
      rules={[{ required: true, message: t("auth.passwordRequired") }]}
    >
      <Input.Password
        prefix={<LockOutlined />}
        placeholder="••••••••"
        size="large"
        autoComplete="off"
      />
    </Form.Item>

    <Form.Item style={{ marginBottom: 0 }}>
      <Button type="primary" htmlType="submit" size="large" loading={loading} block>
        {t("auth.loginButton")}
      </Button>
    </Form.Item>
  </Form>
);

const RegisterFormSection = ({
  form,
  t,
  loading,
  registrationCode,
  onFinish,
  onSwitchToLogin,
}) => (
  <Form
    form={form}
    name="register"
    onFinish={onFinish}
    layout="vertical"
    requiredMark
    autoComplete="off"
  >
    <Form.Item
      name="fullName"
      label={t("auth.fullName")}
      rules={[
        { required: true, message: t("auth.fullNameRequired") },
        {
          pattern: /^[А-Яа-яЁё\s-]+$/,
          message: t("auth.fullNameCyrillic"),
        },
        {
          validator: (_, value) => {
            if (!value) return Promise.resolve();
            const parts = value.trim().split(/\s+/);
            if (parts.length < 2) {
              return Promise.reject(new Error(t("auth.fullNameMinWords")));
            }
            return Promise.resolve();
          },
        },
      ]}
    >
      <Input
        placeholder="Иванов Иван Иванович"
        size="large"
        autoComplete="off"
      />
    </Form.Item>

    <Form.Item
      name="email"
      label={t("auth.email")}
      rules={[
        { required: true, message: t("auth.emailRequired") },
        { type: "email", message: t("auth.invalidEmail") },
      ]}
    >
      <Input
        prefix={<UserOutlined />}
        placeholder="user@example.com"
        size="large"
        autoComplete="off"
      />
    </Form.Item>

    <Form.Item
      name="password"
      label={t("auth.password")}
      rules={[
        { required: true, message: t("auth.passwordRequired") },
        { min: 8, message: t("auth.passwordMin") },
        forbiddenPasswordValidator,
      ]}
    >
      <Input.Password
        prefix={<LockOutlined />}
        placeholder="••••••••"
        size="large"
        autoComplete="off"
      />
    </Form.Item>

    <Form.Item
      name="confirmPassword"
      label={t("auth.confirmPassword")}
      dependencies={["password"]}
      rules={[
        { required: true, message: t("auth.confirmPasswordRequired") },
        ({ getFieldValue }) => ({
          validator(_, value) {
            if (!value || getFieldValue("password") === value) {
              return Promise.resolve();
            }
            return Promise.reject(new Error(t("auth.passwordsNotMatch")));
          },
        }),
      ]}
    >
      <Input.Password
        prefix={<LockOutlined />}
        placeholder="••••••••"
        size="large"
        autoComplete="off"
      />
    </Form.Item>

    <Form.Item style={{ marginBottom: 0 }}>
      <Button
        type="primary"
        htmlType="submit"
        size="large"
        loading={loading}
        block
        icon={<UserAddOutlined />}
      >
        {t("auth.registerButton")}
      </Button>
    </Form.Item>

    {registrationCode && (
      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Text type="secondary">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link onClick={onSwitchToLogin}>{t("auth.loginLink")}</Link>
        </Text>
      </div>
    )}
  </Form>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register } = useAuthStore();
  const { message } = App.useApp();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [registrationCode, setRegistrationCode] = useState(null);
  const [registrationCounterpartyName, setRegistrationCounterpartyName] =
    useState("");

  useEffect(() => {
    const codeFromUrl = searchParams.get("registrationCode");
    setRegistrationCode(codeFromUrl || null);
    setRegistrationCounterpartyName("");

    if (!codeFromUrl) {
      return;
    }

    let isCancelled = false;

    const loadRegistrationInfo = async () => {
      try {
        const response = await api.get("/auth/registration-info", {
          params: { registrationCode: codeFromUrl },
        });
        const counterpartyName =
          response?.data?.data?.counterparty?.name || "";
        if (!isCancelled) {
          setRegistrationCounterpartyName(counterpartyName);
        }
      } catch (error) {
        if (!isCancelled && error?.response?.status !== 404) {
          console.error("Failed to load registration counterparty info:", error);
        }
      }
    };

    void loadRegistrationInfo();

    return () => {
      isCancelled = true;
    };
  }, [searchParams]);

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const response = await login(values);
      message.success(t("auth.loginSuccess"));

      if (!response.data.user.isActive) {
        navigate("/profile");
        return;
      }

      const role = response?.data?.user?.role;
      if (role === "ot_engineer" || role === "ot_admin") {
        navigate("/ot");
        return;
      }

      if (role === "laborer") {
        navigate("/cabinet");
        return;
      }

      navigate("/employees");
    } catch (err) {
      console.error("Login error:", err);

      let errorMessage = t("auth.loginError");
      if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.userMessage) {
        errorMessage = err.userMessage;
      } else if (err.code === "ERR_NETWORK") {
        errorMessage = t("auth.networkError");
      } else if (err.response?.status === 401) {
        errorMessage = t("auth.invalidCredentials");
      } else if (err.response?.status === 403) {
        errorMessage = t("auth.accountDisabled");
      } else if (err.message) {
        errorMessage = err.message;
      }

      message.error(errorMessage, 5);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    setLoading(true);
    try {
      console.log("Attempting registration with:", {
        ...values,
        password: "***",
      });

      const registrationData = {
        ...values,
        ...(registrationCode && { registrationCode }),
      };

      const response = await register(registrationData);
      message.success({
        content: t("auth.registrationSuccess", {
          uin: response.data.user.identificationNumber,
        }),
        duration: 10,
      });

      navigate("/profile");
    } catch (err) {
      console.error("Registration error:", err);

      let errorMessage = t("auth.registrationError");
      if (err.userMessage) {
        errorMessage = err.userMessage;
      } else if (err.response?.data?.errors) {
        const errors = err.response.data.errors;
        errorMessage = errors.map((e) => e.msg || e.message).join("; ");
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.code === "ERR_NETWORK") {
        errorMessage = t("auth.networkError");
      } else if (err.message) {
        errorMessage = err.message;
      }

      message.error(errorMessage, 5);
    } finally {
      setLoading(false);
    }
  };

  if (registrationCode) {
    return (
      <AuthPageLayout
        icon={<UserAddOutlined style={{ fontSize: 20, color: "#fff" }} />}
        title={t("auth.register")}
        subtitle={t("common.portalTitle")}
        subtitleExtra={
          registrationCounterpartyName
            ? `Организация: ${registrationCounterpartyName}`
            : null
        }
        footerText={{
          instruction: t("common.instruction"),
          copyright: t("common.copyright"),
        }}
      >
        <RegisterFormSection
          form={registerForm}
          t={t}
          loading={loading}
          registrationCode={registrationCode}
          onFinish={handleRegister}
          onSwitchToLogin={() => {
            setRegistrationCode(null);
            navigate("/login", { replace: true });
          }}
        />
      </AuthPageLayout>
    );
  }

  const loginOnlyTabItems = [
    {
      key: "login",
      label: (
        <span>
          <LoginOutlined />
          {t("auth.login")}
        </span>
      ),
      children: (
        <LoginFormSection
          form={loginForm}
          t={t}
          loading={loading}
          onFinish={handleLogin}
        />
      ),
    },
  ];

  return (
    <AuthPageLayout
      icon={<LoginOutlined style={{ fontSize: 20, color: "#fff" }} />}
      title="PassDesk"
      subtitle={t("common.portalTitle")}
      footerText={{
        instruction: t("common.instruction"),
        copyright: t("common.copyright"),
      }}
    >
      <Tabs activeKey="login" items={loginOnlyTabItems} centered />
    </AuthPageLayout>
  );
};

export default LoginPage;
