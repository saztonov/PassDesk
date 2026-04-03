import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler.js";
import { User } from "../models/index.js";
import { getTranslator } from "../i18n/index.js";
import { resolveMobileEmployeeSession } from "../services/mobileEmployeeAccessService.js";

const SUPPORTED_LANGUAGES = new Set(["ru", "uz", "tj", "kz"]);

const normalizeLanguage = (lng) => {
  if (!lng) return "ru";
  const normalized = lng.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : "ru";
};

export const authenticate = async (req, res, next) => {
  try {
    // Получаем токен из заголовка
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Необходима авторизация", 401);
    }

    const token = authHeader.split(" ")[1];

    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Загружаем пользователя с counterpartyId и identificationNumber
    const user = await User.findByPk(decoded.id, {
      attributes: [
        "id",
        "role",
        "counterpartyId",
        "isActive",
        "isDeleted",
        "identificationNumber",
        "userLanguage",
      ],
    });

    if (!user) {
      throw new AppError("Пользователь не найден", 401);
    }
    if (user.isDeleted) {
      throw new AppError("Пользователь не найден", 401);
    }

    // Проверяем, активен ли пользователь
    if (!user.isActive) {
      throw new AppError(
        "Ваш аккаунт не активирован администратором. УИН: " +
          user.identificationNumber || "не указан",
        403,
      );
    }

    // Добавляем данные пользователя в запрос
    req.user = {
      id: user.id,
      role: user.role,
      counterpartyId: user.counterpartyId,
      userLanguage: user.userLanguage,
    };
    req.language = normalizeLanguage(
      user.userLanguage || req.headers["accept-language"],
    );
    req.t = getTranslator(req.language);

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Невалидный токен авторизации", 401));
    }
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Время сессии истекло. Войдите снова", 401));
    }
    next(error);
  }
};

// Middleware для аутентификации БЕЗ проверки активации (для страницы профиля)
export const authenticateWithoutActivationCheck = async (req, res, next) => {
  try {
    // Получаем токен из заголовка
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Необходима авторизация", 401);
    }

    const token = authHeader.split(" ")[1];

    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Загружаем пользователя с counterpartyId и identificationNumber
    const user = await User.findByPk(decoded.id, {
      attributes: [
        "id",
        "role",
        "counterpartyId",
        "isActive",
        "isDeleted",
        "identificationNumber",
        "userLanguage",
      ],
    });

    if (!user) {
      throw new AppError("Пользователь не найден", 401);
    }
    if (user.isDeleted) {
      throw new AppError("Пользователь не найден", 401);
    }

    // НЕ проверяем isActive - разрешаем доступ всем авторизованным пользователям

    // Добавляем данные пользователя в запрос
    req.user = {
      id: user.id,
      role: user.role,
      counterpartyId: user.counterpartyId,
      isActive: user.isActive,
      userLanguage: user.userLanguage,
    };
    req.language = normalizeLanguage(
      user.userLanguage || req.headers["accept-language"],
    );
    req.t = getTranslator(req.language);

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Невалидный токен авторизации", 401));
    }
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Время сессии истекло. Войдите снова", 401));
    }
    next(error);
  }
};

// Middleware для logout - НЕ требует валидный токен (может быть истёкший)
// Разрешает logout даже если токен истек или отсутствует
export const authenticateForLogout = async (req, res, next) => {
  try {
    // Получаем токен из заголовка
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Разрешаем logout даже без токена
      return next();
    }

    const token = authHeader.split(" ")[1];

    // Пытаемся декодировать токен (если успешно)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: ["id", "role", "counterpartyId"],
      });

      if (user) {
        req.user = {
          id: user.id,
          role: user.role,
          counterpartyId: user.counterpartyId,
        };
      }
    } catch (tokenError) {
      // Даже если токен невалиден или истёк - разрешаем logout
      if (process.env.NODE_ENV === "development") {
        console.log(
          "⏱️ Token validation skipped for logout:",
          tokenError.message,
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Необходима авторизация", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Недостаточно прав. Требуется роль: ${roles.join(" или ")}`,
          403,
        ),
      );
    }

    next();
  };
};

export const authenticateMobileEmployeeSession = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Необходима мобильная авторизация", 401);
    }

    const token = authHeader.split(" ")[1];
    const session = await resolveMobileEmployeeSession(token);

    req.mobileEmployeeSession = session;
    req.mobileEmployee = {
      sessionId: session.id,
      employeeId: session.employeeId,
      phoneNormalized: session.phoneNormalized,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    next(new AppError("Мобильная сессия недействительна", 401));
  }
};
