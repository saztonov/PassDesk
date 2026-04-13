import {
  Counterparty,
  CounterpartyConstructionSiteMapping,
} from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  assertOtAccess,
  assertCounterpartySiteAccess,
  getDefaultCounterpartyId,
} from "../utils/otAccess.js";
import {
  getEffectiveStatusesBulk,
  getStatusSummaryForSites,
  recalculateStatus,
  overrideStatus,
} from "../services/otStatusService.js";

export const getOtContractorStatuses = async (req, res, next) => {
  try {
    const { isStaff } = await assertOtAccess(req.user);

    const { constructionSiteId, counterpartyId: counterpartyIdQuery } =
      req.query;

    if (!constructionSiteId) {
      throw new AppError("constructionSiteId обязателен", 400);
    }

    let counterpartyIds = [];
    const defaultCounterpartyId = await getDefaultCounterpartyId();

    if (isStaff) {
      if (counterpartyIdQuery) {
        counterpartyIds = [counterpartyIdQuery];
      } else {
        const mappings = await CounterpartyConstructionSiteMapping.findAll({
          where: { constructionSiteId },
          attributes: ["counterpartyId"],
        });
        counterpartyIds = mappings.map((mapping) => mapping.counterpartyId);
      }
    } else {
      counterpartyIds = [req.user.counterpartyId];
      await assertCounterpartySiteAccess(
        req.user,
        req.user.counterpartyId,
        constructionSiteId,
      );
    }

    if (defaultCounterpartyId) {
      counterpartyIds = counterpartyIds.filter(
        (id) => id !== defaultCounterpartyId,
      );
    }

    if (counterpartyIds.length === 0) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const counterparties = await Counterparty.findAll({
      where: { id: counterpartyIds },
      attributes: ["id", "name", "inn"],
    });

    const effectiveStatuses = await getEffectiveStatusesBulk(
      counterpartyIds,
      constructionSiteId,
    );
    const effectiveMap = new Map(
      effectiveStatuses.map((item) => [item.counterpartyId, item]),
    );

    const statuses = counterparties.map((counterparty) => {
      const effective = effectiveMap.get(counterparty.id);
      return {
        counterparty,
        status: effective?.status || "not_admitted",
        isManual: effective?.isManual || false,
        missingRequired: effective?.missingRequired ?? 0,
        totalRequired: effective?.totalRequired ?? 0,
        approvedRequired: effective?.approvedRequired ?? 0,
      };
    });

    res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    console.error("Error fetching OT contractor statuses:", error);
    next(error);
  }
};

export const getOtContractorStatusSummary = async (req, res, next) => {
  try {
    const { isStaff } = await assertOtAccess(req.user, { requireStaff: true });

    if (!isStaff) {
      throw new AppError("Доступ запрещен", 403);
    }

    const { constructionSiteIds } = req.query;
    const siteIds = (constructionSiteIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!siteIds.length) {
      return res.json({ success: true, data: [] });
    }

    const defaultCounterpartyId = await getDefaultCounterpartyId();
    const mappings = await CounterpartyConstructionSiteMapping.findAll({
      where: { constructionSiteId: siteIds },
      attributes: ["counterpartyId", "constructionSiteId"],
    });

    const filteredMappings = defaultCounterpartyId
      ? mappings.filter(
          (mapping) => mapping.counterpartyId !== defaultCounterpartyId,
        )
      : mappings;

    const summaries = await getStatusSummaryForSites(siteIds, filteredMappings);

    res.json({
      success: true,
      data: summaries,
    });
  } catch (error) {
    console.error("Error fetching OT contractor status summary:", error);
    next(error);
  }
};

export const overrideOtContractorStatus = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { counterpartyId, siteId } = req.params;
    const requestedStatus = req.body?.status;

    if (!counterpartyId || !siteId) {
      throw new AppError("counterpartyId и siteId обязательны", 400);
    }

    const allowedStatuses = ["temp_admitted", "admitted", "blocked"];
    const status = requestedStatus || "temp_admitted";

    if (!allowedStatuses.includes(status)) {
      throw new AppError("Недопустимый статус", 400);
    }

    const record = await overrideStatus(
      counterpartyId,
      siteId,
      req.user.id,
      status,
    );

    const messageByStatus = {
      temp_admitted: "Статус временного допуска установлен",
      admitted: "Ручной допуск установлен",
      blocked: "Подрядчик заблокирован",
    };

    res.json({
      success: true,
      message: messageByStatus[status] || "Статус обновлен",
      data: record,
    });
  } catch (error) {
    console.error("Error overriding OT contractor status:", error);
    next(error);
  }
};

export const recalculateOtContractorStatus = async (req, res, next) => {
  try {
    await assertOtAccess(req.user, { requireAdmin: true });

    const { counterpartyId, siteId } = req.params;

    if (!counterpartyId || !siteId) {
      throw new AppError("counterpartyId и siteId обязательны", 400);
    }

    const result = await recalculateStatus(
      counterpartyId,
      siteId,
      req.user.id,
      {
        force: true,
      },
    );

    res.json({
      success: true,
      message: "Статус пересчитан",
      data: {
        status: result.status,
        isManual: result.isManual,
        missingRequired: result.missingDocuments?.length || 0,
        totalRequired: result.totalRequired || 0,
        approvedRequired: result.approvedRequired || 0,
      },
    });
  } catch (error) {
    console.error("Error recalculating OT contractor status:", error);
    next(error);
  }
};
