import {
  Counterparty,
  Employee,
  Position,
  ConstructionSite,
  CounterpartyConstructionSiteMapping,
  CounterpartySubcounterpartyMapping,
  CounterpartyTypeMapping,
  Setting,
  sequelize,
} from "../models/index.js";
import { Op } from "sequelize";
import { AppError } from "../middleware/errorHandler.js";

// Получить все контрагенты
export const getAllCounterparties = async (req, res, next) => {
  try {
    const { type, search, page = 1, limit = 100, include } = req.query;

    // Ограничиваем максимальный лимит на 10000 для предотвращения нагрузки
    const actualLimit = Math.min(parseInt(limit) || 100, 10000);

    const where = {};

    // Проверка прав доступа на основе роли и контрагента
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (req.user.role === "admin") {
      // admin видит всех контрагентов - без ограничений
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ к справочнику контрагентов
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - только свой контрагент + прямые субподрядчики
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      where.id = { [Op.in]: allowedIds };
    }

    // Фильтр по типу (для будущего использования с новой системой типов)
    if (type) {
      where.type = type;
    }

    // Поиск по названию или ИНН
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { inn: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * actualLimit;

    // Настройка include для связанных данных
    const includeOptions = [];

    // ВСЕГДА включаем типы контрагентов
    includeOptions.push({
      model: CounterpartyTypeMapping,
      as: "typeMapping",
      attributes: ["types"],
      required: false,
    });

    // ВСЕГДА включаем информацию о родительском контрагенте
    includeOptions.push({
      model: CounterpartySubcounterpartyMapping,
      as: "parentMappings",
      attributes: ["parentCounterpartyId"],
      required: false,
      include: [
        {
          model: Counterparty,
          as: "parentCounterparty",
          attributes: ["id", "name"],
        },
      ],
    });

    // Если запрошено включение construction_sites
    if (include && include.includes("construction_sites")) {
      includeOptions.push({
        model: ConstructionSite,
        as: "constructionSites",
        attributes: ["id", "shortName", "fullName"],
        through: { attributes: [] },
      });
    }

    const { count, rows } = await Counterparty.findAndCountAll({
      where,
      include: includeOptions,
      limit: actualLimit,
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      distinct: true,
    });

    // Преобразуем данные для фронтенда
    const transformedRows = rows.map((row) => {
      const counterparty = row.toJSON();
      // Добавляем parentCounterparty на верхний уровень для удобства
      if (
        counterparty.parentMappings &&
        counterparty.parentMappings.length > 0
      ) {
        counterparty.parentCounterparty =
          counterparty.parentMappings[0].parentCounterparty;
      }
      return counterparty;
    });

    res.json({
      success: true,
      data: {
        counterparties: transformedRows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: actualLimit,
          pages: Math.ceil(count / actualLimit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching counterparties:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Получить контрагента по ID
export const getCounterpartyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    }

    if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - проверить доступ только к своим
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      if (!allowedIds.includes(id)) {
        return next(new AppError("Доступ к этому контрагенту запрещен", 403));
      }
    }

    const counterparty = await Counterparty.findByPk(id, {
      include: [
        {
          model: Employee,
          as: "employees",
          include: [
            {
              model: Position,
              as: "position",
              attributes: ["id", "name"],
            },
          ],
          attributes: [
            "id",
            "firstName",
            "lastName",
            "lastNameEnc",
            "lastNameKeyVersion",
            "positionId",
          ],
        },
        {
          model: CounterpartyTypeMapping,
          as: "typeMapping",
          attributes: ["types"],
          required: false,
        },
      ],
    });

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    res.json({
      success: true,
      data: counterparty,
    });
  } catch (error) {
    console.error("Error fetching counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Создать контрагента
export const createCounterparty = async (req, res, next) => {
  try {
    const counterpartyData = req.body;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ к справочнику
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    }

    // Очищаем пустые строки для необязательных полей
    if (counterpartyData.email === "") counterpartyData.email = null;
    if (counterpartyData.phone === "") counterpartyData.phone = null;
    if (counterpartyData.kpp === "") counterpartyData.kpp = null;
    if (counterpartyData.ogrn === "") counterpartyData.ogrn = null;
    if (counterpartyData.legalAddress === "")
      counterpartyData.legalAddress = null;

    // Используем транзакцию для создания контрагента и связанных записей
    const result = await sequelize.transaction(async (t) => {
      let counterparty;
      let typeMapping;

      if (req.user.role === "admin") {
        // Admin создает контрагента с указанным типом
        counterparty = await Counterparty.create(
          {
            ...counterpartyData,
            type: counterpartyData.type || null, // Для обратной совместимости
          },
          { transaction: t },
        );

        // Создаем запись в counterparties_types_mapping
        if (counterpartyData.type) {
          typeMapping = await CounterpartyTypeMapping.create(
            {
              counterpartyId: counterparty.id,
              types: [counterpartyData.type],
            },
            { transaction: t },
          );
        }
      } else if (
        req.user.role === "user" &&
        req.user.counterpartyId !== defaultCounterpartyId
      ) {
        // User (не default) создает субподрядчика
        counterparty = await Counterparty.create(
          {
            ...counterpartyData,
            type: null, // Новая логика не использует это поле
          },
          { transaction: t },
        );

        // Создаем запись в counterparties_types_mapping с типом subcontractor
        typeMapping = await CounterpartyTypeMapping.create(
          {
            counterpartyId: counterparty.id,
            types: ["subcontractor"],
          },
          { transaction: t },
        );

        // Создаем связь родитель-субподрядчик
        await CounterpartySubcounterpartyMapping.create(
          {
            parentCounterpartyId: req.user.counterpartyId,
            childCounterpartyId: counterparty.id,
            createdBy: req.user.id,
          },
          { transaction: t },
        );
      }

      return { counterparty, typeMapping };
    });

    res.status(201).json({
      success: true,
      message: "Контрагент успешно создан",
      data: result.counterparty,
    });
  } catch (error) {
    console.error("Error creating counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }

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

// Обновить контрагента
export const updateCounterparty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - запретить доступ
      return next(
        new AppError("Доступ к справочнику контрагентов запрещен", 403),
      );
    }

    if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - может редактировать только своих субподрядчиков
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = subcontractors.map((s) => s.childCounterpartyId);

      if (!allowedIds.includes(id)) {
        return next(
          new AppError("Можно редактировать только своих субподрядчиков", 403),
        );
      }
    }

    // Очищаем пустые строки для необязательных полей
    if (updates.email === "") updates.email = null;
    if (updates.phone === "") updates.phone = null;
    if (updates.kpp === "") updates.kpp = null;
    if (updates.ogrn === "") updates.ogrn = null;
    if (updates.legalAddress === "") updates.legalAddress = null;

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Используем транзакцию для обновления
    await sequelize.transaction(async (t) => {
      // Обновляем контрагента
      await counterparty.update(updates, { transaction: t });

      // Если admin обновляет тип - обновляем в counterparties_types_mapping
      if (req.user.role === "admin" && updates.type) {
        const existingTypeMapping = await CounterpartyTypeMapping.findOne({
          where: { counterpartyId: id },
          transaction: t,
        });

        if (existingTypeMapping) {
          await existingTypeMapping.update(
            {
              types: [updates.type],
            },
            { transaction: t },
          );
        } else {
          await CounterpartyTypeMapping.create(
            {
              counterpartyId: id,
              types: [updates.type],
            },
            { transaction: t },
          );
        }
      }
    });

    res.json({
      success: true,
      message: "Контрагент успешно обновлен",
      data: counterparty,
    });
  } catch (error) {
    console.error("Error updating counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }

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

// Удалить контрагента
export const deleteCounterparty = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка прав доступа - admin и manager могут удалять
    if (req.user.role !== "admin" && req.user.role !== "manager") {
      return next(
        new AppError(
          "Только администратор или менеджер может удалять контрагентов",
          403,
        ),
      );
    }

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Проверяем есть ли связанные сотрудники (только если таблица существует)
    try {
      const employeesCount = await Employee.count({
        where: { counterparty_id: id },
      });

      if (employeesCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Невозможно удалить контрагента: есть ${employeesCount} связанных сотрудников`,
        });
      }
    } catch (employeeCheckError) {
      // Если таблица employees не существует или нет поля counterparty_id - игнорируем
      console.warn("Warning checking employees:", employeeCheckError.message);
    }

    await counterparty.destroy();

    res.json({
      success: true,
      message: "Контрагент успешно удален",
    });
  } catch (error) {
    console.error("Error deleting counterparty:", error);
    if (error.statusCode) {
      return next(error);
    }

    // Обработка ошибки внешнего ключа (контрагент используется в других таблицах)
    if (error.name === "SequelizeForeignKeyConstraintError") {
      const table = error.table || "unknown";
      const tableNames = {
        contracts: "договорах",
        employees: "сотрудниках",
      };
      const tableName = tableNames[table] || table;

      return res.status(400).json({
        success: false,
        message: `Невозможно удалить контрагента: он используется в ${tableName}`,
      });
    }

    next(error);
  }
};

// Получить статистику по контрагентам
export const getCounterpartiesStats = async (req, res, next) => {
  try {
    const stats = await Counterparty.findAll({
      attributes: [
        "type",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["type"],
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching counterparties stats:", error);
    next(error);
  }
};

// Генерация уникального кода регистрации для контрагента
export const generateRegistrationCode = async (req, res, next) => {
  try {
    const { id } = req.params;

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Если код уже есть - возвращаем его
    if (counterparty.registrationCode) {
      return res.json({
        success: true,
        data: {
          registrationCode: counterparty.registrationCode,
        },
      });
    }

    // Генерируем новый уникальный код
    let registrationCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 100;

    while (!isUnique && attempts < maxAttempts) {
      // Генерация 8-значного кода
      registrationCode = String(Math.floor(Math.random() * 100000000)).padStart(
        8,
        "0",
      );

      // Проверка уникальности
      const existing = await Counterparty.findOne({
        where: { registrationCode },
      });

      if (!existing) {
        isUnique = true;
      }

      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({
        success: false,
        message: "Не удалось сгенерировать уникальный код",
      });
    }

    // Сохраняем код
    await counterparty.update({ registrationCode });

    res.json({
      success: true,
      message: "Код регистрации успешно сгенерирован",
      data: {
        registrationCode,
      },
    });
  } catch (error) {
    console.error("Error generating registration code:", error);
    next(error);
  }
};

// Получить объекты контрагента
export const getCounterpartyConstructionSites = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверка прав доступа:
    // user может получать объекты только для своего контрагента и своих субподрядчиков
    if (req.user.role === "user") {
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      if (!allowedIds.includes(id)) {
        return next(
          new AppError(
            "Можно просматривать объекты только своего контрагента и своих субподрядчиков",
            403,
          ),
        );
      }
    }

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    const constructionSites = await counterparty.getConstructionSites({
      attributes: ["id", "shortName", "fullName"],
      joinTableAttributes: ["id"],
    });

    res.json({
      success: true,
      data: constructionSites,
    });
  } catch (error) {
    console.error("Error fetching counterparty construction sites:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Сохранить объекты контрагента
export const saveCounterpartyConstructionSites = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { constructionSiteIds } = req.body;

    // Проверка прав доступа
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      return next(new AppError("Доступ запрещен", 403));
    }

    if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) может назначать объекты только своим субподрядчикам
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = subcontractors.map((s) => s.childCounterpartyId);

      if (!allowedIds.includes(id)) {
        return next(
          new AppError(
            "Можно назначать объекты только своим субподрядчикам",
            403,
          ),
        );
      }

      // Получаем объекты, назначенные родительскому контрагенту (самому user)
      const parentCounterparty = await Counterparty.findByPk(
        req.user.counterpartyId,
      );
      const parentConstructionSites =
        await parentCounterparty.getConstructionSites({
          attributes: ["id"],
        });
      const parentSiteIds = parentConstructionSites.map((site) => site.id);

      // Проверяем, что все выбранные объекты есть в списке родительских
      if (constructionSiteIds && constructionSiteIds.length > 0) {
        const invalidSiteIds = constructionSiteIds.filter(
          (siteId) => !parentSiteIds.includes(siteId),
        );

        if (invalidSiteIds.length > 0) {
          return next(
            new AppError(
              "Можно назначать только те объекты, которые назначены вашему контрагенту",
              403,
            ),
          );
        }
      }
    }

    const counterparty = await Counterparty.findByPk(id);

    if (!counterparty) {
      return res.status(404).json({
        success: false,
        message: "Контрагент не найден",
      });
    }

    // Очищаем старые связи и создаем новые
    await CounterpartyConstructionSiteMapping.destroy({
      where: { counterpartyId: id },
    });

    if (constructionSiteIds && constructionSiteIds.length > 0) {
      const mappings = constructionSiteIds.map((siteId) => ({
        counterpartyId: id,
        constructionSiteId: siteId,
      }));

      await CounterpartyConstructionSiteMapping.bulkCreate(mappings);
    }

    res.json({
      success: true,
      message: "Объекты контрагента успешно сохранены",
    });
  } catch (error) {
    console.error("Error saving counterparty construction sites:", error);
    if (error.statusCode) {
      return next(error);
    }
    next(error);
  }
};

// Получить список доступных контрагентов для текущего пользователя
export const getAvailableCounterparties = async (req, res, next) => {
  try {
    const defaultCounterpartyId = await Setting.getSetting(
      "default_counterparty_id",
    );

    let where = {};

    if (req.user.role === "admin") {
      // admin видит всех контрагентов
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId === defaultCounterpartyId
    ) {
      // user (default) - только свой контрагент
      where.id = req.user.counterpartyId;
    } else if (
      req.user.role === "user" &&
      req.user.counterpartyId !== defaultCounterpartyId
    ) {
      // user (не default) - свой контрагент + субподрядчики
      const subcontractors = await CounterpartySubcounterpartyMapping.findAll({
        where: { parentCounterpartyId: req.user.counterpartyId },
        attributes: ["childCounterpartyId"],
      });

      const allowedIds = [
        req.user.counterpartyId,
        ...subcontractors.map((s) => s.childCounterpartyId),
      ];

      where.id = { [Op.in]: allowedIds };
    }

    const counterparties = await Counterparty.findAll({
      where,
      attributes: ["id", "name", "inn"],
      include: [
        {
          model: CounterpartyTypeMapping,
          as: "typeMapping",
          attributes: ["types"],
          required: false,
        },
      ],
      order: [["name", "ASC"]],
    });

    res.json({
      success: true,
      data: counterparties,
    });
  } catch (error) {
    console.error("Error fetching available counterparties:", error);
    next(error);
  }
};
