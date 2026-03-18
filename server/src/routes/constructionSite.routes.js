import express from "express";
import {
  getAllConstructionSites,
  getConstructionSiteById,
  createConstructionSite,
  updateConstructionSite,
  deleteConstructionSite,
} from "../controllers/constructionSite.controller.js";
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
  getAllConstructionSites,
);
router.get(
  "/:id",
  authorize("admin", "user", "manager", "ot_admin", "ot_engineer"),
  getConstructionSiteById,
);

// ======================================
// ИЗМЕНЕНИЕ - только для администраторов
// ======================================
router.post("/", authorize("admin", "manager"), createConstructionSite);
router.put("/:id", authorize("admin", "manager"), updateConstructionSite);
router.delete("/:id", authorize("admin", "manager"), deleteConstructionSite);

export default router;
