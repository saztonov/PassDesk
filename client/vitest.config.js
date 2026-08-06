import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Те же алиасы, что и в vite.config.js: иначе модули с "@/..." не резолвятся в тестах
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
  test: {
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    environment: "node",
    clearMocks: true,
  },
});
