import { AppError } from "../middleware/errorHandler.js";
import { User, RefreshToken } from "../models/index.js";
import { Op } from "sequelize";
import {
  isPasswordAllowed,
  getForbiddenPasswordMessage,
} from "../utils/forbiddenPasswords.js";
import {
  PASSWORD_MIN_LENGTH,
  getPasswordMinLengthMessage,
} from "../utils/passwordPolicy.js";

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

export const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, role, isActive } = req.query;

    const offset = (page - 1) * limit;
    const where = { isDeleted: false };

    // Фильтр по поиску
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Фильтр по роли
    if (role) {
      where.role = role;
    }

    // Фильтр по активности
    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: [
        "id",
        "email",
        "firstName",
        "lastName",
        "role",
        "counterpartyId",
        "identificationNumber",
        "isActive",
        "createdAt",
      ],
      limit: parseInt(limit),
      offset,
      order: [["createdAt", "DESC"]],
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user || user.isDeleted) {
      throw new AppError("Пользователь не найден", 404);
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role = "user",
      counterpartyId,
    } = req.body;

    // Проверяем, существует ли пользователь
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError("Пользователь с таким email уже существует", 409);
    }

    // Создаем пользователя
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      role,
      counterpartyId,
    });

    res.status(201).json({
      success: true,
      message: "Пользователь создан успешно",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Не разрешаем обновлять пароль через этот endpoint
    delete updateData.password;

    const user = await User.findByPk(id);
    if (!user || user.isDeleted) {
      throw new AppError("Пользователь не найден", 404);
    }

    // Если обновляется email, проверяем уникальность
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await User.findOne({
        where: { email: updateData.email },
      });
      if (existingUser) {
        throw new AppError("Пользователь с таким email уже существует", 409);
      }
    }

    // Если УИН пустой или отсутствует - генерируем новый
    if (!user.identificationNumber || user.identificationNumber.trim() === "") {
      updateData.identificationNumber = await generateUniqueUIN();
    }

    await user.update(updateData);

    res.json({
      success: true,
      message: "Пользователь обновлен успешно",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверяем, что это не попытка удалить самого себя
    if (id === req.user.id) {
      throw new AppError("Вы не можете удалить собственный аккаунт", 400);
    }

    const user = await User.findByPk(id);
    if (!user || user.isDeleted) {
      throw new AppError("Пользователь не найден", 404);
    }

    await user.update({
      isDeleted: true,
      deletedAt: new Date(),
      isActive: false,
    });

    res.json({
      success: true,
      message: "Пользователь удален успешно",
    });
  } catch (error) {
    next(error);
  }
};

export const permanentlyDeleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      throw new AppError("Вы не можете удалить собственный аккаунт", 400);
    }

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError("Пользователь не найден", 404);
    }

    if (!user.isDeleted) {
      throw new AppError(
        "Полное удаление доступно только для пользователей из корзины",
        400,
      );
    }

    await user.destroy();

    res.json({
      success: true,
      message: "Пользователь удален навсегда",
    });
  } catch (error) {
    if (error.name === "SequelizeForeignKeyConstraintError") {
      return next(
        new AppError(
          "Нельзя удалить пользователя: есть связанные записи в системе",
          409,
        ),
      );
    }
    next(error);
  }
};

export const getDeletedUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const where = { isDeleted: true };

    if (search) {
      where[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: [
        "id",
        "email",
        "firstName",
        "lastName",
        "role",
        "counterpartyId",
        "identificationNumber",
        "isActive",
        "deletedAt",
        "createdAt",
      ],
      limit: parseInt(limit),
      offset,
      order: [["deletedAt", "DESC"]],
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const restoreUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user || !user.isDeleted) {
      throw new AppError("Пользователь не найден", 404);
    }

    // Проверяем, не существует ли активный пользователь с таким email
    const existing = await User.findOne({
      where: {
        email: user.email,
        isDeleted: false,
        id: { [Op.ne]: user.id },
      },
    });
    if (existing) {
      throw new AppError(
        "Невозможно восстановить: найден активный пользователь с таким email",
        409,
      );
    }

    await user.update({
      isDeleted: false,
      deletedAt: null,
    });

    res.json({
      success: true,
      message: "Пользователь восстановлен",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const updatePassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Только сам пользователь или admin может менять пароль
    if (req.user.id !== id && req.user.role !== "admin") {
      throw new AppError("Недостаточно прав для изменения пароля", 403);
    }

    const user = await User.findByPk(id, {
      attributes: { include: ["password"] },
    });
    if (!user || user.isDeleted) {
      throw new AppError("Пользователь не найден", 404);
    }

    // Если не admin, требуем текущий пароль
    if (req.user.role !== "admin") {
      if (!currentPassword) {
        throw new AppError("Необходимо указать текущий пароль", 400);
      }

      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        throw new AppError("Неверный текущий пароль", 401);
      }
    }

    // Проверяем длину нового пароля
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new AppError(getPasswordMinLengthMessage("Новый пароль"), 400);
    }

    // Проверяем, не является ли новый пароль запрещенным
    if (!isPasswordAllowed(newPassword)) {
      throw new AppError(getForbiddenPasswordMessage(), 400);
    }

    // Обновляем пароль
    await user.update({ password: newPassword });
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId: user.id } },
    );

    res.json({
      success: true,
      message: "Пароль обновлен успешно",
    });
  } catch (error) {
    next(error);
  }
};

export const toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError("Пользователь не найден", 404);
    }

    // Не разрешаем деактивировать самого себя
    if (id === req.user.id) {
      throw new AppError(
        "Вы не можете деактивировать собственный аккаунт",
        400,
      );
    }

    await user.update({ isActive: !user.isActive });

    res.json({
      success: true,
      message: user.isActive
        ? "Пользователь активирован"
        : "Пользователь деактивирован",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Получить профиль текущего пользователя
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError("Пользователь не найден", 404);
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Обновить профиль текущего пользователя
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { firstName, email, userLanguage } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError("Пользователь не найден", 404);
    }

    // Если обновляется email, проверяем уникальность
    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        where: { email },
      });
      if (existingUser) {
        throw new AppError("Пользователь с таким email уже существует", 409);
      }
    }

    // Обновляем только разрешенные поля
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (email !== undefined) updateData.email = email;
    if (userLanguage !== undefined) {
      const allowedRoles = ["user", "admin"];
      if (!allowedRoles.includes(req.user.role)) {
        throw new AppError("Недостаточно прав для изменения языка", 403);
      }
      updateData.userLanguage = userLanguage;
    }

    await user.update(updateData);

    res.json({
      success: true,
      message: "Профиль обновлен успешно",
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Сменить пароль текущего пользователя
 */
export const changeMyPassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError("Необходимо указать текущий и новый пароль", 400);
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new AppError(getPasswordMinLengthMessage("Новый пароль"), 400);
    }

    // Проверяем, не является ли новый пароль запрещенным
    if (!isPasswordAllowed(newPassword)) {
      throw new AppError(getForbiddenPasswordMessage(), 400);
    }

    const user = await User.findByPk(userId, {
      attributes: { include: ["password"] },
    });
    if (!user) {
      throw new AppError("Пользователь не найден", 404);
    }

    // Проверяем текущий пароль
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw new AppError("Неверный текущий пароль", 401);
    }

    // Проверяем, что новый пароль отличается от текущего
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      throw new AppError("Новый пароль должен отличаться от текущего", 400);
    }

    // Обновляем пароль
    await user.update({ password: newPassword });

    res.json({
      success: true,
      message: "Пароль успешно изменен",
    });
  } catch (error) {
    next(error);
  }
};
