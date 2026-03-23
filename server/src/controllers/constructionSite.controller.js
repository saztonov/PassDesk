import { ConstructionSite, Contract } from "../models/index.js";
import { Op } from "sequelize";

const MAX_LIST_LIMIT = 100;
const SITE_MUTABLE_FIELDS = ["shortName", "fullName", "address"];

const sanitizeConstructionSitePayload = (payload = {}) => {
  const sanitized = {};
  for (const field of SITE_MUTABLE_FIELDS) {
    if (payload[field] !== undefined) {
      const value = typeof payload[field] === "string"
        ? payload[field].trim()
        : payload[field];

      if (field === "shortName") {
        sanitized[field] = value;
        continue;
      }

      sanitized[field] = value === "" ? null : value;
    }
  }
  return sanitized;
};

// Получить все объекты строительства
export const getAllConstructionSites = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(
      Math.max(parseInt(limit, 10) || 10, 1),
      MAX_LIST_LIMIT,
    );

    const where = {};

    // Поиск по названию или адресу
    if (search) {
      where[Op.or] = [
        { shortName: { [Op.iLike]: `%${search}%` } },
        { fullName: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (safePage - 1) * safeLimit;

    const { count, rows } = await ConstructionSite.findAndCountAll({
      where,
      limit: safeLimit,
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    res.json({
      success: true,
      data: {
        constructionSites: rows,
        pagination: {
          total: count,
          page: safePage,
          limit: safeLimit,
          pages: Math.ceil(count / safeLimit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching construction sites:", error);
    next(error);
  }
};

// Получить объект по ID
export const getConstructionSiteById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const site = await ConstructionSite.findByPk(id, {
      include: [
        {
          model: Contract,
          as: "contracts",
          attributes: ["id", "contractNumber", "contractDate", "type"],
        },
      ],
    });

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Объект строительства не найден",
      });
    }

    res.json({
      success: true,
      data: site,
    });
  } catch (error) {
    console.error("Error fetching construction site:", error);
    next(error);
  }
};

// Создать объект строительства
export const createConstructionSite = async (req, res, next) => {
  try {
    const payload = sanitizeConstructionSitePayload(req.body);
    if (!payload.shortName) {
      return res.status(400).json({
        success: false,
        message: "Краткое название объекта обязательно",
      });
    }

    const site = await ConstructionSite.create({
      ...payload,
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
    });

    res.status(201).json({
      success: true,
      message: "Объект строительства успешно создан",
      data: site,
    });
  } catch (error) {
    console.error("Error creating construction site:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Ошибка валидации",
        errors: error.errors.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      });
    }

    next(error);
  }
};

// Обновить объект строительства
export const updateConstructionSite = async (req, res, next) => {
  try {
    const { id } = req.params;

    const site = await ConstructionSite.findByPk(id);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Объект строительства не найден",
      });
    }

    const payload = sanitizeConstructionSitePayload(req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Нет полей для обновления",
      });
    }

    if ("shortName" in payload && !payload.shortName) {
      return res.status(400).json({
        success: false,
        message: "Краткое название объекта обязательно",
      });
    }

    await site.update({
      ...payload,
      updatedBy: req.user?.id || null,
    });

    res.json({
      success: true,
      message: "Объект строительства успешно обновлен",
      data: site,
    });
  } catch (error) {
    console.error("Error updating construction site:", error);

    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Ошибка валидации",
        errors: error.errors.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      });
    }

    next(error);
  }
};

// Удалить объект строительства
export const deleteConstructionSite = async (req, res, next) => {
  try {
    const { id } = req.params;

    const site = await ConstructionSite.findByPk(id);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Объект строительства не найден",
      });
    }

    // Проверяем есть ли связанные договоры
    const contractsCount = await Contract.count({
      where: { construction_site_id: id },
    });

    if (contractsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Невозможно удалить объект: есть ${contractsCount} связанных договоров`,
      });
    }

    await site.destroy();

    res.json({
      success: true,
      message: "Объект строительства успешно удален",
    });
  } catch (error) {
    console.error("Error deleting construction site:", error);
    next(error);
  }
};
