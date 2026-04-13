import { ExcelColumnSet, User } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { Op } from 'sequelize';

/**
 * Получить все наборы столбцов для контрагента текущего пользователя
 */
export const getAll = async (req, res, next) => {
  try {
    const userCounterpartyId = req.user.counterpartyId;

    if (!userCounterpartyId) {
      throw new AppError('Пользователь не привязан к контрагенту', 400);
    }

    const columnSets = await ExcelColumnSet.findAll({
      where: {
        counterpartyId: userCounterpartyId,
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      order: [
        ['isDefault', 'DESC'], // Набор по умолчанию первым
        ['name', 'ASC'],
      ],
    });

    res.json({
      success: true,
      data: columnSets,
    });
  } catch (error) {
    console.error('Error getting column sets:', error);
    next(error);
  }
};

/**
 * Получить набор столбцов по ID
 */
export const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userCounterpartyId = req.user.counterpartyId;

    const columnSet = await ExcelColumnSet.findOne({
      where: {
        id,
        counterpartyId: userCounterpartyId, // Проверяем что набор принадлежит контрагенту пользователя
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });

    if (!columnSet) {
      throw new AppError('Набор столбцов не найден', 404);
    }

    res.json({
      success: true,
      data: columnSet,
    });
  } catch (error) {
    console.error('Error getting column set:', error);
    next(error);
  }
};

/**
 * Создать новый набор столбцов
 */
export const create = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userCounterpartyId = req.user.counterpartyId;
    const { name, columns, isDefault = false } = req.body;

    if (!userCounterpartyId) {
      throw new AppError('Пользователь не привязан к контрагенту', 400);
    }

    // Валидация входных данных
    if (!name || !name.trim()) {
      throw new AppError('Название набора обязательно', 400);
    }

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      throw new AppError('Необходимо выбрать хотя бы один столбец', 400);
    }

    // Проверяем уникальность имени в рамках контрагента
    const existingSet = await ExcelColumnSet.findOne({
      where: {
        name: name.trim(),
        counterpartyId: userCounterpartyId,
      },
    });

    if (existingSet) {
      throw new AppError('Набор с таким названием уже существует', 400);
    }

    // Если новый набор будет по умолчанию, снимаем флаг с других наборов
    if (isDefault) {
      await ExcelColumnSet.update(
        { isDefault: false },
        {
          where: {
            counterpartyId: userCounterpartyId,
            isDefault: true,
          },
        }
      );
    }

    // Создаем набор
    const columnSet = await ExcelColumnSet.create({
      name: name.trim(),
      counterpartyId: userCounterpartyId,
      columns,
      isDefault,
      createdBy: userId,
    });

    // Загружаем созданный набор с ассоциациями
    const createdSet = await ExcelColumnSet.findByPk(columnSet.id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });

    res.status(201).json({
      success: true,
      data: createdSet,
      message: 'Набор столбцов успешно создан',
    });
  } catch (error) {
    console.error('Error creating column set:', error);
    next(error);
  }
};

/**
 * Обновить набор столбцов
 */
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userCounterpartyId = req.user.counterpartyId;
    const { name, columns, isDefault } = req.body;

    // Находим набор
    const columnSet = await ExcelColumnSet.findOne({
      where: {
        id,
        counterpartyId: userCounterpartyId, // Проверяем что набор принадлежит контрагенту пользователя
      },
    });

    if (!columnSet) {
      throw new AppError('Набор столбцов не найден', 404);
    }

    // Проверяем уникальность имени (если имя изменилось)
    if (name && name.trim() !== columnSet.name) {
      const existingSet = await ExcelColumnSet.findOne({
        where: {
          name: name.trim(),
          counterpartyId: userCounterpartyId,
          id: { [Op.ne]: id },
        },
      });

      if (existingSet) {
        throw new AppError('Набор с таким названием уже существует', 400);
      }
    }

    // Если устанавливаем флаг по умолчанию, снимаем его с других наборов
    if (isDefault === true && !columnSet.isDefault) {
      await ExcelColumnSet.update(
        { isDefault: false },
        {
          where: {
            counterpartyId: userCounterpartyId,
            isDefault: true,
          },
        }
      );
    }

    // Обновляем набор
    await columnSet.update({
      ...(name && { name: name.trim() }),
      ...(columns && { columns }),
      ...(isDefault !== undefined && { isDefault }),
      updatedBy: userId,
    });

    // Загружаем обновленный набор с ассоциациями
    const updatedSet = await ExcelColumnSet.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });

    res.json({
      success: true,
      data: updatedSet,
      message: 'Набор столбцов успешно обновлен',
    });
  } catch (error) {
    console.error('Error updating column set:', error);
    next(error);
  }
};

/**
 * Удалить набор столбцов
 */
export const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userCounterpartyId = req.user.counterpartyId;

    // Находим набор
    const columnSet = await ExcelColumnSet.findOne({
      where: {
        id,
        counterpartyId: userCounterpartyId, // Проверяем что набор принадлежит контрагенту пользователя
      },
    });

    if (!columnSet) {
      throw new AppError('Набор столбцов не найден', 404);
    }

    await columnSet.destroy();

    res.json({
      success: true,
      message: 'Набор столбцов успешно удален',
    });
  } catch (error) {
    console.error('Error deleting column set:', error);
    next(error);
  }
};

/**
 * Установить набор как набор по умолчанию
 */
export const setDefault = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userCounterpartyId = req.user.counterpartyId;

    // Находим набор
    const columnSet = await ExcelColumnSet.findOne({
      where: {
        id,
        counterpartyId: userCounterpartyId,
      },
    });

    if (!columnSet) {
      throw new AppError('Набор столбцов не найден', 404);
    }

    // Снимаем флаг по умолчанию со всех наборов контрагента
    await ExcelColumnSet.update(
      { isDefault: false },
      {
        where: {
          counterpartyId: userCounterpartyId,
          isDefault: true,
        },
      }
    );

    // Устанавливаем текущий набор как по умолчанию
    await columnSet.update({
      isDefault: true,
      updatedBy: req.user.id,
    });

    res.json({
      success: true,
      message: 'Набор установлен по умолчанию',
    });
  } catch (error) {
    console.error('Error setting default column set:', error);
    next(error);
  }
};
