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
  authorize("admin", "user", "ot_admin", "ot_engineer"),
  getAllCounterparties,
);
router.get(
  "/available",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  getAvailableCounterparties,
); // Список доступных контрагентов для выбора
router.get(
  "/stats",
  authorize("admin", "user", "ot_admin", "ot_engineer"),
  getCounterpartiesStats,
);
router.get(
  "/:id",
  authorize("admin", "user", "ot_admin", "ot_engineer"),
  getCounterpartyById,
);
router.get(
  "/:id/construction-sites",
  authorize("admin", "user", "ot_admin", "ot_engineer"),
  getCounterpartyConstructionSites,
);

// ======================================
// ИЗМЕНЕНИЕ - только для администраторов и пользователей (не default)
// ======================================
router.post("/", authorize("admin", "user"), createCounterparty);
router.post(
  "/:id/generate-registration-code",
  authorize("admin"),
  generateRegistrationCode,
);
router.post(
  "/:id/construction-sites",
  authorize("admin", "user"),
  saveCounterpartyConstructionSites,
);
router.put("/:id", authorize("admin", "user"), updateCounterparty);
router.delete("/:id", authorize("admin"), deleteCounterparty);

export default router;
