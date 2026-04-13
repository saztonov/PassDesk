import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { sequelize } from "./config/database.js";
import { errorHandler } from "./middleware/errorHandler.js";
import routes from "./routes/index.js";
import { attachTranslator } from "./middleware/i18n.js";
import { startTelegramBot } from "./telegram/bot.js";
import { startSkudWorkers } from "./queues/skud/queue.js";
import { startUploadWorkers } from "./queues/employeeUploads/queue.js";
import { startOcrWorkers } from "./queues/employeeOcr/queue.js";
import { cleanupStaleTempFiles } from "./middleware/upload.js";
import { isSkudEnabled, skudConfig } from "./services/skud/skudConfig.js";
import { runSkudEventsPull } from "./controllers/skud.controller.js";

// Загружаем переменные окружения
dotenv.config();

// ======================================
// ПРОВЕРКА БЕЗОПАСНОСТИ КОНФИГУРАЦИИ
// ======================================

// Проверка JWT_SECRET
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(
    "❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET должен быть минимум 32 символа!",
  );
  console.error("   Установите надежный JWT_SECRET в файле .env");
  process.exit(1);
}

// Проверка JWT_REFRESH_SECRET
if (
  !process.env.JWT_REFRESH_SECRET ||
  process.env.JWT_REFRESH_SECRET.length < 32
) {
  console.error(
    "❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_REFRESH_SECRET должен быть минимум 32 символа!",
  );
  console.error("   Установите надежный JWT_REFRESH_SECRET в файле .env");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || "50mb";
const URLENCODED_BODY_LIMIT = process.env.URLENCODED_BODY_LIMIT || "50mb";
let skudEventsPullTimer = null;
let skudEventsPullInFlight = false;

// ======================================
// TRUST PROXY - Для работы за Nginx
// ======================================
// Включаем trust proxy только при явной конфигурации в проде
// (иначе возможен spoofing X-Forwarded-* заголовков при прямом доступе к приложению)
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

// ======================================
// RATE LIMITING - Защита от брутфорса
// ======================================

// Лимит для аутентификации (строгий)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // Максимум 5 попыток за 15 минут
  message: {
    success: false,
    message: "Слишком много попыток входа. Попробуйте снова через 15 минут.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Не считать успешные запросы
});

// Лимит для refresh токена (мягкий - разрешить частые обновления)
const refreshLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 30, // Максимум 30 обновлений в минуту (достаточно для проактивного обновления)
  message: {
    success: false,
    message:
      "Слишком много попыток обновления токена. Попробуйте снова через минуту.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Не считать успешные запросы обновления
});

// Лимит для регистрации (умеренный)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 3, // Максимум 3 регистрации в час с одного IP
  message: {
    success: false,
    message: "Слишком много попыток регистрации. Попробуйте снова через час.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Лимит для GET запросов (мягкий - для справочников и чтения данных)
const getApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 1000, // 1000 запросов в минуту для чтения
  message: {
    success: false,
    message: "Слишком много запросов на чтение. Попробуйте снова через минуту.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== "GET", // Применяется только к GET
});

// Лимит для POST/PUT/DELETE запросов (строже - для мутаций)
const mutationApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 минута
  max: 100, // 100 запросов в минуту для изменений
  message: {
    success: false,
    message:
      "Слишком много запросов на изменение данных. Попробуйте снова через минуту.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "GET", // Применяется только к POST/PUT/DELETE
});

// Middleware
app.use(helmet());
const normalizeOrigin = (value) => String(value || "").trim().replace(/\/$/, "");
const allowedCorsOrigins = new Set(
  [
    "http://localhost:5173",
    "https://localhost:5173",
    "http://127.0.0.1:5173",
    "https://127.0.0.1:5173",
    process.env.CLIENT_URL, // Для VPS используется переменная окружения
  ]
    .filter(Boolean)
    .map(normalizeOrigin),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowedCorsOrigins.has(normalizeOrigin(origin)));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
);
app.use(compression());
app.use(morgan("dev"));
// Увеличиваем лимиты для больших загрузок (импорт больших файлов Excel)
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: URLENCODED_BODY_LIMIT }));
app.use(cookieParser());
app.use(attachTranslator);

// Health check (без лимитов)
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// ======================================
// ПРИМЕНЕНИЕ RATE LIMITERS
// ======================================
const apiPrefix = `/api/${process.env.API_VERSION || "v1"}`;

// Строгие лимиты для аутентификации
app.use(`${apiPrefix}/auth/login`, authLimiter);
app.use(`${apiPrefix}/auth/register`, registerLimiter);
app.use(`${apiPrefix}/auth/refresh`, refreshLimiter);

// Раздельные лимиты для GET и мутаций
app.use(apiPrefix, getApiLimiter); // 1000/мин для GET
app.use(apiPrefix, mutationApiLimiter); // 100/мин для POST/PUT/DELETE

// API Routes
app.use(apiPrefix, routes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error Handler
app.use(errorHandler);

// Database connection and server start
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log("✅ Database connected successfully");

    // Hotfix compatibility: ensure new employee date column exists
    // so API doesn't fail when app code is newer than DB schema.
    await sequelize.query(`
      ALTER TABLE public.employees
      ADD COLUMN IF NOT EXISTS planned_exit_date date;
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_planned_exit_date
      ON public.employees USING btree (planned_exit_date);
    `);

    // НЕ синхронизируем модели автоматически!
    // Таблицы создаются только явно через: npm run db:init
    // Изменения в БД делаются только через миграции с явным запуском

    // Start server - слушаем на всех сетевых интерфейсах
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV}`);
      console.log(
        `🔗 API: http://localhost:${PORT}/api/${process.env.API_VERSION || "v1"}`,
      );
      if (process.env.SERVER_URL) {
        console.log(
          `🔗 API (VPS): ${process.env.SERVER_URL}/api/${process.env.API_VERSION || "v1"}`,
        );
      }

      startTelegramBot().catch((error) => {
        console.error("Telegram bot startup failed:", error.message);
      });

      if (isSkudEnabled()) {
        startSkudWorkers()
          .then(() => {
            console.log("✅ SKUD queue workers started");
          })
          .catch((error) => {
            console.error("❌ SKUD workers startup failed:", error.message);
          });

        const pullIntervalMs = skudConfig?.events?.pullIntervalMs || 300000;
        const runAutoPull = async () => {
          if (skudEventsPullInFlight) {
            return;
          }
          skudEventsPullInFlight = true;
          try {
            const result = await runSkudEventsPull();
            console.log(
              `✅ SKUD events auto-pull: fetched=${result?.fetched || 0}, imported=${result?.imported || 0}`,
            );
          } catch (error) {
            console.error(
              "❌ SKUD events auto-pull failed:",
              error?.message || error,
            );
          } finally {
            skudEventsPullInFlight = false;
          }
        };

        skudEventsPullTimer = setInterval(() => {
          runAutoPull().catch(() => {
            // noop: all errors are handled inside runAutoPull
          });
        }, pullIntervalMs);

        if (typeof skudEventsPullTimer?.unref === "function") {
          skudEventsPullTimer.unref();
        }

        console.log(
          `✅ SKUD events auto-pull scheduled every ${pullIntervalMs} ms`,
        );

        runAutoPull().catch(() => {
          // noop: all errors are handled inside runAutoPull
        });

        const stopSkudEventsPull = () => {
          if (skudEventsPullTimer) {
            clearInterval(skudEventsPullTimer);
            skudEventsPullTimer = null;
          }
        };
        process.once("SIGINT", stopSkudEventsPull);
        process.once("SIGTERM", stopSkudEventsPull);
      }

      cleanupStaleTempFiles();

      startUploadWorkers()
        .then(() => {
          console.log("✅ Upload queue workers started");
        })
        .catch((error) => {
          console.error("❌ Upload workers startup failed:", error.message);
        });

      startOcrWorkers()
        .then(() => {
          console.log("✅ OCR queue workers started");
        })
        .catch((error) => {
          console.error("❌ OCR workers startup failed:", error.message);
        });
    });
  } catch (error) {
    console.error("❌ Unable to start server:", error);
    process.exit(1);
  }
};

startServer();
