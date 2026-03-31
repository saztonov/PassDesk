import { Op } from "sequelize";
import {
  AuditLog,
  Counterparty,
  Employee,
  EmployeeCounterpartyMapping,
  User,
  sequelize,
} from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { AUDIT_EVENT_TYPES } from "../services/auditEventService.js";

const AUDIT_EVENT_CATEGORIES = Object.freeze({
  EMPLOYEE_DATA: "employee_data",
  TRANSFER: "transfer",
  STATUS: "status",
  FILES: "files",
  SKUD: "skud",
});

const CATEGORY_ACTIONS = Object.freeze({
  [AUDIT_EVENT_CATEGORIES.EMPLOYEE_DATA]: [AUDIT_EVENT_TYPES.EMPLOYEE_UPDATED],
  [AUDIT_EVENT_CATEGORIES.TRANSFER]: [AUDIT_EVENT_TYPES.EMPLOYEE_TRANSFERRED],
  [AUDIT_EVENT_CATEGORIES.STATUS]: [
    AUDIT_EVENT_TYPES.STATUS_CHANGED,
    AUDIT_EVENT_TYPES.ZUP_FLAG_CHANGED,
  ],
  [AUDIT_EVENT_CATEGORIES.FILES]: [
    AUDIT_EVENT_TYPES.FILE_UPLOADED,
    AUDIT_EVENT_TYPES.FILE_DELETED,
  ],
  [AUDIT_EVENT_CATEGORIES.SKUD]: [
    AUDIT_EVENT_TYPES.PASS_ASSIGNED,
    AUDIT_EVENT_TYPES.PASS_UNBOUND,
  ],
});

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 20;

const getFullName = (entity) =>
  [entity?.lastName, entity?.firstName, entity?.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();

const getUserDisplayName = (user) =>
  [user?.lastName, user?.firstName].filter(Boolean).join(" ").trim() ||
  user?.email ||
  null;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseDateValue = (value, fieldName) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`Некорректное значение ${fieldName}`, 400);
  }

  return parsed;
};

const normalizeQueryValues = (value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  const rawItems = Array.isArray(value) ? value : [value];
  return [...new Set(
    rawItems
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean),
  )];
};

const resolveCategoryByAction = (action) => {
  const match = Object.entries(CATEGORY_ACTIONS).find(([, actions]) =>
    actions.includes(action),
  );
  return match?.[0] || "other";
};

const getRequestedActions = ({ eventType, eventCategory }) => {
  const requestedEventTypes = normalizeQueryValues(eventType);
  const requestedCategories = normalizeQueryValues(eventCategory).filter(
    (category) => Boolean(CATEGORY_ACTIONS[category]),
  );

  if (requestedEventTypes.length === 0 && requestedCategories.length === 0) {
    return [];
  }

  const categoryActions = [
    ...new Set(
      requestedCategories.flatMap((category) => CATEGORY_ACTIONS[category] || []),
    ),
  ];

  if (requestedEventTypes.length === 0) {
    return categoryActions;
  }

  if (categoryActions.length === 0) {
    return requestedEventTypes;
  }

  const categoryActionSet = new Set(categoryActions);
  return requestedEventTypes.filter((event) => categoryActionSet.has(event));
};

const extractCounterpartyIds = (details = {}) => {
  const ids = new Set();

  if (details?.counterpartyId) {
    ids.add(String(details.counterpartyId));
  }

  if (details?.toCounterparty?.id) {
    ids.add(String(details.toCounterparty.id));
  }

  if (details?.metadata?.targetCounterparty?.id) {
    ids.add(String(details.metadata.targetCounterparty.id));
  }

  if (Array.isArray(details?.fromCounterparties)) {
    details.fromCounterparties.forEach((counterparty) => {
      if (counterparty?.id) {
        ids.add(String(counterparty.id));
      }
    });
  }

  return [...ids];
};

const enrichLogs = async (logs) => {
  const employeeIds = [
    ...new Set(
      logs
        .filter((log) => log.entityType === "employee" && log.entityId)
        .map((log) => String(log.entityId)),
    ),
  ];

  const counterpartiesFromDetails = [
    ...new Set(logs.flatMap((log) => extractCounterpartyIds(log.details || {}))),
  ];

  const [employees, counterparties] = await Promise.all([
    employeeIds.length > 0
      ? Employee.findAll({
          where: { id: { [Op.in]: employeeIds } },
          attributes: [
            "id",
            "firstName",
            "lastName",
            "lastNameEnc",
            "lastNameKeyVersion",
            "middleName",
          ],
          include: [
            {
              model: EmployeeCounterpartyMapping,
              as: "employeeCounterpartyMappings",
              required: false,
              where: { dismissedAt: null },
              attributes: ["id", "counterpartyId", "dismissedAt"],
              include: [
                {
                  model: Counterparty,
                  as: "counterparty",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        })
      : [],
    counterpartiesFromDetails.length > 0
      ? Counterparty.findAll({
          where: { id: { [Op.in]: counterpartiesFromDetails } },
          attributes: ["id", "name"],
        })
      : [],
  ]);

  const employeeMap = new Map(
    employees.map((employee) => {
      const activeMapping =
        employee.employeeCounterpartyMappings?.find((mapping) => !mapping.dismissedAt) ||
        null;

      return [
        String(employee.id),
        {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          middleName: employee.middleName,
          fullName: getFullName(employee) || null,
          counterparty: activeMapping?.counterparty
            ? {
                id: activeMapping.counterparty.id,
                name: activeMapping.counterparty.name,
              }
            : null,
        },
      ];
    }),
  );

  const counterpartyMap = new Map(
    counterparties.map((counterparty) => [
      String(counterparty.id),
      {
        id: counterparty.id,
        name: counterparty.name,
      },
    ]),
  );

  return logs.map((log) => {
    const employee = log.entityId ? employeeMap.get(String(log.entityId)) : null;
    const detailsCounterpartyIds = extractCounterpartyIds(log.details || {});
    const resolvedCounterparty =
      detailsCounterpartyIds
        .map((counterpartyId) => counterpartyMap.get(String(counterpartyId)))
        .find(Boolean) ||
      employee?.counterparty ||
      null;

    return {
      id: log.id,
      action: log.action,
      eventType: log.details?.eventType || log.action,
      eventCategory: resolveCategoryByAction(log.action),
      entityType: log.entityType,
      entityId: log.entityId,
      status: log.status,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt,
      details: log.details || {},
      user: log.user
        ? {
            id: log.user.id,
            firstName: log.user.firstName,
            lastName: log.user.lastName,
            email: log.user.email,
            fullName: getUserDisplayName(log.user),
          }
        : null,
      employee,
      counterparty: resolvedCounterparty,
    };
  });
};

export const getAuditLogs = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(
      parsePositiveInt(req.query.limit, DEFAULT_LIMIT),
      MAX_LIMIT,
    );
    const offset = (page - 1) * limit;
    const eventType = req.query.eventType || null;
    const eventCategory = req.query.eventCategory || null;
    const counterpartyId = req.query.counterpartyId || null;
    const userIds = normalizeQueryValues(req.query.userId);
    const dateFrom = parseDateValue(req.query.dateFrom, "dateFrom");
    const dateTo = parseDateValue(req.query.dateTo, "dateTo");

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new AppError("Дата начала не может быть позже даты окончания", 400);
    }

    const requestedActions = getRequestedActions({
      eventType,
      eventCategory,
    });

    const andConditions = [];

    andConditions.push({
      entityType: "employee",
      entityId: {
        [Op.ne]: null,
      },
    });

    if (requestedActions.length > 0) {
      andConditions.push({
        action: {
          [Op.in]: requestedActions,
        },
      });
    }

    if (dateFrom || dateTo) {
      const createdAtFilter = {};

      if (dateFrom) {
        createdAtFilter[Op.gte] = dateFrom;
      }

      if (dateTo) {
        createdAtFilter[Op.lte] = dateTo;
      }

      andConditions.push({ createdAt: createdAtFilter });
    }

    if (counterpartyId) {
      const escapedCounterpartyId = sequelize.escape(String(counterpartyId));
      andConditions.push(
        sequelize.literal(`(
          details->>'counterpartyId' = ${escapedCounterpartyId}
          OR details->'toCounterparty'->>'id' = ${escapedCounterpartyId}
          OR details->'metadata'->'targetCounterparty'->>'id' = ${escapedCounterpartyId}
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(details->'fromCounterparties', '[]'::jsonb)) AS cp
            WHERE cp->>'id' = ${escapedCounterpartyId}
          )
        )`),
      );
    }

    if (userIds.length === 1) {
      andConditions.push({ userId: userIds[0] });
    } else if (userIds.length > 1) {
      andConditions.push({
        userId: {
          [Op.in]: userIds,
        },
      });
    }

    const where =
      andConditions.length > 0
        ? {
            [Op.and]: andConditions,
          }
        : {};

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "firstName", "lastName", "email"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const normalizedRows = rows.map((row) => row.toJSON());
    const enrichedLogs = await enrichLogs(normalizedRows);

    res.json({
      success: true,
      data: {
        logs: enrichedLogs,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
