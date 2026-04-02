import express from "express";
import {
  getAllCounterparties,
  getCounterpartyById,
  createCounterparty,
  updateCounterparty,
  deleteCounterparty,
  getCounterpartiesStats,
  generateRegistrationCode,
  getCounterpartyConstructionSites,
  saveCounterpartyConstructionSites,
  syncCounterpartyConstructionSitesFromSkud,
  getAvailableCounterparties,
} from "../controllers/counterparty.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Все роуты требуют аутентификации
router.use(authenticate);

// ======================================
// ЧТЕНИЕ - доступно всем авторизованным пользователям
// ======================================
router.get(
  "/",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  getAllCounterparties,
);
router.get(
  "/available",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  getAvailableCounterparties,
); // Список доступных контрагентов для выбора
router.get(
  "/stats",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  getCounterpartiesStats,
);
router.get(
  "/:id",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  getCounterpartyById,
);
router.get(
  "/:id/construction-sites",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  getCounterpartyConstructionSites,
);

// ======================================
// ИЗМЕНЕНИЕ - только для администраторов и пользователей (не default)
// ======================================
router.post(
  "/",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  createCounterparty,
);
router.post(
  "/sync-construction-sites-from-skud",
  authorize("admin", "manager"),
  syncCounterpartyConstructionSitesFromSkud,
);
router.post(
  "/:id/generate-registration-code",
  authorize("admin", "manager", "ot_admin", "ot_engineer"),
  generateRegistrationCode,
);
router.post(
  "/:id/construction-sites",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  saveCounterpartyConstructionSites,
);
router.put(
  "/:id",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  updateCounterparty,
);
router.delete(
  "/:id",
  authorize("admin", "manager", "ot_admin", "ot_engineer"),
  deleteCounterparty,
);

export default router;
