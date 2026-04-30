import express from "express";
import rateLimit from "express-rate-limit";
import { body, query } from "express-validator";
import { validate } from "../middleware/validator.js";
import { authenticateSync1c } from "../middleware/sync1cAuth.js";
import * as sync1cController from "../controllers/sync1c.controller.js";

const router = express.Router();

const syncRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Слишком много запросов синхронизации. Повторите через минуту.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-1c-key"] ?? req.ip,
});

router.use(authenticateSync1c);
router.use(syncRateLimiter);

router.post(
  "/employees",
  [
    body("employees").isArray({ min: 1 }).withMessage("employees должен быть непустым массивом"),
    body("employees.*.Физлицо_id_all").isUUID().withMessage("Физлицо_id_all должен быть UUID"),
    body("employees.*.ФизЛицо").notEmpty().withMessage("ФизЛицо обязателен"),
  ],
  validate,
  sync1cController.receiveEmployees
);

router.get(
  "/employees/changes",
  [query("since").notEmpty().withMessage("Параметр since обязателен")],
  validate,
  sync1cController.getChanges
);

export default router;
