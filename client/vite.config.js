import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...fileEnv, ...process.env };
  const devHost = env.VITE_DEV_HOST || "localhost";
  const devPort = Number(env.VITE_DEV_PORT || 5173);
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:5003";
  const useHttps =
    String(env.VITE_DEV_HTTPS || "false").toLowerCase() === "true";
  const usePolling =
    String(
      env.VITE_USE_POLLING ??
        env.CHOKIDAR_USEPOLLING ??
        env.WATCHPACK_POLLING ??
        "false",
    ).toLowerCase() === "true";
  const pollingInterval = Number(
    env.VITE_POLLING_INTERVAL ?? env.CHOKIDAR_INTERVAL ?? 150,
  );
  const useHmrOverlay =
    String(env.VITE_HMR_OVERLAY ?? "true").toLowerCase() === "true";
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || "localhost,127.0.0.1")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: useHttps ? [react(), basicSsl()] : [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@/entities": path.resolve(__dirname, "./src/entities"),
        "@/widgets": path.resolve(__dirname, "./src/widgets"),
        "@/features": path.resolve(__dirname, "./src/features"),
        "@/pages": path.resolve(__dirname, "./src/pages"),
        "@/shared": path.resolve(__dirname, "./src/shared"),
      },
    },
    server: {
      port: devPort,
      host: devHost, // localhost для разработки, VPS использует production build
      https: useHttps, // Включить HTTPS с самоподписанным сертификатом (basicSsl плагин)
      allowedHosts,
      watch: usePolling
        ? {
            usePolling: true,
            interval: pollingInterval,
          }
        : undefined,
      hmr: {
        overlay: useHmrOverlay,
      },
      proxy: {
        "/api": {
          target: proxyTarget, // Проксируем на локальный бэкенд
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: devPort,
      host: devHost,
      https: useHttps,
      allowedHosts,
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
    worker: {
      format: "iife",
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.js",
      css: true,
    },
  };
});
