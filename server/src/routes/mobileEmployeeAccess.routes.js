import express from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import * as mobileEmployeeAccessController from "../controllers/mobileEmployeeAccess.controller.js";
import { authenticateMobileEmployeeSession } from "../middleware/auth.js";
import { validate } from "../middleware/validator.js";

const router = express.Router();

const requestCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Слишком много запросов кода. Попробуйте позже.",
  },
});

const verifyCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Слишком много попыток подтверждения. Попробуйте позже.",
  },
});

const quickQrLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Слишком много запросов QR. Попробуйте позже.",
  },
});

router.post(
  "/request-code",
  requestCodeLimiter,
  body("phone").isString().trim().notEmpty(),
  body("deviceLabel").optional().isString().trim(),
  validate,
  mobileEmployeeAccessController.requestCode,
);

router.post(
  "/verify-code",
  verifyCodeLimiter,
  body("phone").isString().trim().notEmpty(),
  body("code").isString().trim().isLength({ min: 4, max: 8 }),
  body("deviceLabel").optional().isString().trim(),
  validate,
  mobileEmployeeAccessController.verifyCode,
);

router.post(
  "/quick-qr",
  quickQrLimiter,
  body("phone").isString().trim().notEmpty(),
  body("deviceLabel").optional().isString().trim(),
  validate,
  mobileEmployeeAccessController.issueQuickQr,
);

router.use(authenticateMobileEmployeeSession);

router.get("/me", mobileEmployeeAccessController.me);
router.post("/skud/qr", mobileEmployeeAccessController.issueSkudQr);
router.post("/logout", mobileEmployeeAccessController.logout);

export default router;
