import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AppError } from "../middleware/errorHandler.js";
import { User, Setting, Counterparty, RefreshToken } from "../models/index.js";
import sequelize from "../config/database.js";
import {
  isPasswordAllowed,
  getForbiddenPasswordMessage,
} from "../utils/forbiddenPasswords.js";
import {
  PASSWORD_MIN_LENGTH,
  getPasswordMinLengthMessage,
} from "../utils/passwordPolicy.js";

// Генерация JWT токена
const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// Генерация refresh токена
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId, jti: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || "30d",
    },
  );
};

const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const getTokenExpiryDate = (token) => {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) {
    return null;
  }
  return new Date(decoded.exp * 1000);
};

const setRefreshCookie = (res, token) => {
  const expiryDate = getTokenExpiryDate(token);
  const maxAge = expiryDate
    ? Math.max(expiryDate.getTime() - Date.now(), 0)
    : undefined;

  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/${process.env.API_VERSION || "v1"}/auth`,
    maxAge,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/${process.env.API_VERSION || "v1"}/auth`,
  });
};

const createRefreshTokenRecord = async (
  userId,
  refreshToken,
  req,
  transaction = null,
) => {
  const expiresAt = getTokenExpiryDate(refreshToken);
  try {
    return await RefreshToken.create(
      {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdByIp: req.ip,
        userAgent: req.get("user-agent"),
      },
      { transaction },
    );
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      const retryToken = generateRefreshToken(userId);
      return await RefreshToken.create(
        {
          userId,
          tokenHash: hashToken(retryToken),
          expiresAt:
            getTokenExpiryDate(retryToken) ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdByIp: req.ip,
          userAgent: req.get("user-agent"),
        },
        { transaction },
      );
    }
    throw error;
  }
};

/**
 * Генерация уникального УИН (6-значный)
 */
const generateUniqueUIN = async () => {
  const maxAttempts = 1000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Генерация случайного 6-значного числа
    const uin = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");

    // Проверка уникальности
    const existing = await User.findOne({
      where: { identificationNumber: uin },
    });
    if (!existing) {
      return uin;
    }

    attempts++;
  }

  throw new AppError("Не удалось сгенерировать уникальный УИН", 500);
};

/**
 * Парсинг ФИО из строки
 * @param {string} fullName - ФИО в формате "Фамилия Имя Отчество"
 * @returns {object} - { lastName, firstName, middleName }
 */
const parseFullName = (fullName) => {
  const parts = fullName.trim().split(/\s+/);

  return {
    lastName: parts[0] || "",
    firstName: parts[1] || "",
    middleName: parts.slice(2).join(" ") || null,
  };
};

export const register = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    // Логируем только в development и без персональных данных
    if (process.env.NODE_ENV === "development") {
      console.log("📝 Registration attempt");
    }
    const { email, password, fullName, registrationCode } = req.body;

    // Валидация входных данных
    if (!email || !password || !fullName) {
      throw new AppError("Все обязательные поля должны быть заполнены", 400);
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new AppError(getPasswordMinLengthMessage("Пароль"), 400);
    }

    // Проверяем, не является ли пароль запрещенным
    if (!isPasswordAllowed(password)) {
      throw new AppError(getForbiddenPasswordMessage(), 400);
    }

    // Парсим ФИО
    const { lastName, firstName, middleName } = parseFullName(fullName);

    // Проверяем, существует ли пользователь
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError("Пользователь с таким email уже существует", 409);
    }

    // Определяем контрагента
    let counterpartyId;
    let isDefaultCounterparty = false;

    if (registrationCode) {
      // Регистрация по коду контрагента
      const counterparty = await Counterparty.findOne({
        where: { registrationCode },
      });

      if (!counterparty) {
        throw new AppError("Неверный код регистрации", 400);
      }

      counterpartyId = counterparty.id;
      isDefaultCounterparty = false;
    } else {
      // Регистрация с контрагентом по умолчанию
      const defaultCounterpartyId = await Setting.getSetting(
        "default_counterparty_id",
      );

      if (!defaultCounterpartyId || defaultCounterpartyId === "") {
        throw new AppError(
          "Регистрация временно недоступна. Обратитесь к администратору.",
          503,
        );
      }

      counterpartyId = defaultCounterpartyId;
      isDefaultCounterparty = true;
    }

    // Генерируем УИН
    const identificationNumber = await generateUniqueUIN();

    // Создаем пользователя (пароль автоматически хешируется в хуке модели)
    const user = await User.create(
      {
        email,
        password,
        firstName: fullName, // Сохраняем полное ФИО в first_name
        lastName: null, // last_name теперь NULL
        role: "user",
        counterpartyId,
        identificationNumber,
        isActive: false, // Пользователь неактивен до активации администратором
        userLanguage: "ru",
      },
      { transaction },
    );

    // Коммитим транзакцию
    await transaction.commit();

    // Генерируем токены для автоматического входа
    const token = generateToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await createRefreshTokenRecord(user.id, refreshToken, req);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      message:
        "Регистрация прошла успешно. Дождитесь активации аккаунта администратором.",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          counterpartyId: user.counterpartyId,
          identificationNumber: user.identificationNumber,
          isActive: user.isActive,
          userLanguage: user.userLanguage,
        },
        token,
      },
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Находим пользователя (включая поле password) с контрагентом
    const user = await User.findOne({
      where: { email },
      attributes: { include: ["password"] },
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name", "type"],
        },
      ],
    });

    if (!user || user.isDeleted) {
      throw new AppError(
        "Неверный email или пароль. Проверьте правильность введенных данных.",
        401,
      );
    }

    // Проверяем пароль
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new AppError(
        "Неверный email или пароль. Проверьте правильность введенных данных.",
        401,
      );
    }

    // Разрешаем вход даже неактивным пользователям
    // Они будут перенаправлены на страницу профиля на фронтенде

    // Генерируем токены
    const token = generateToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await createRefreshTokenRecord(user.id, refreshToken, req);
    setRefreshCookie(res, refreshToken);

    // Обновляем lastLogin
    await user.update({ lastLogin: new Date() });

    res.json({
      success: true,
      message: "Вход выполнен успешно",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          counterpartyId: user.counterpartyId,
          counterpartyType: user.counterparty?.type || null,
          identificationNumber: user.identificationNumber,
          isActive: user.isActive,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { tokenHash: hashToken(refreshToken) } },
      );
    }

    clearRefreshCookie(res);

    res.json({
      success: true,
      message: "Выход выполнен успешно",
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      throw new AppError("Refresh token не предоставлен", 400);
    }

    // Проверяем refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const storedToken = await RefreshToken.findOne({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!storedToken) {
      throw new AppError("Неверный или истекший refresh token", 401);
    }

    if (storedToken.revokedAt) {
      await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { userId: storedToken.userId } },
      );
      throw new AppError("Неверный или истекший refresh token", 401);
    }

    if (storedToken.expiresAt && storedToken.expiresAt < new Date()) {
      await storedToken.update({ revokedAt: new Date() });
      throw new AppError("Неверный или истекший refresh token", 401);
    }

    // Находим пользователя
    const user = await User.findByPk(decoded.id);
    if (!user || user.isDeleted) {
      throw new AppError("Пользователь не найден", 404);
    }

    if (!user.isActive) {
      throw new AppError("Аккаунт деактивирован", 403);
    }

    if (
      user.passwordChangedAt &&
      decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime()
    ) {
      await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { userId: user.id } },
      );
      throw new AppError("Неверный или истекший refresh token", 401);
    }

    // Генерируем новые токены
    const newToken = generateToken(user.id, user.role);
    const newRefreshToken = generateRefreshToken(user.id);
    const newRefreshRecord = await createRefreshTokenRecord(
      user.id,
      newRefreshToken,
      req,
    );

    await storedToken.update({
      revokedAt: new Date(),
      replacedByTokenId: newRefreshRecord.id,
    });

    setRefreshCookie(res, newRefreshToken);

    res.json({
      success: true,
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return next(new AppError("Неверный или истекший refresh token", 401));
    }
    next(error);
  }
};

export const getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      include: [
        {
          model: Counterparty,
          as: "counterparty",
          attributes: ["id", "name", "type"],
        },
      ],
    });
    if (!user) {
      throw new AppError("Пользователь не найден", 404);
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          identificationNumber: user.identificationNumber,
          counterpartyId: user.counterpartyId,
          counterpartyType: user.counterparty?.type || null,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          userLanguage: user.userLanguage,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
