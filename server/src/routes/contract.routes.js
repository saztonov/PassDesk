import express from "express";
import {
  getAllContracts,
  getContractById,
  createContract,
  updateContract,
  deleteContract,
} from "../controllers/contract.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Все роуты требуют аутентификации
router.use(authenticate);

// ======================================
// ЧТЕНИЕ - доступно всем авторизованным пользователям
// ======================================
router.get("/", authorize("admin", "manager"), getAllContracts);
router.get("/:id", authorize("admin", "manager"), getContractById);

// ======================================
// ИЗМЕНЕНИЕ - только для администраторов
// ======================================
router.post("/", authorize("admin", "manager"), createContract);
router.put("/:id", authorize("admin", "manager"), updateContract);
router.delete("/:id", authorize("admin", "manager"), deleteContract);

export default router;
