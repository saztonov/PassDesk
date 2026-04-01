import express from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validator.js";
import {
  authenticate,
  authenticateWithoutActivationCheck,
  authorize,
} from "../middleware/auth.js";
import * as userController from "../controllers/user.controller.js";
import {
  PASSWORD_MIN_LENGTH,
  getPasswordMinLengthMessage,
} from "../utils/passwordPolicy.js";

const router = express.Router();

// Маршруты для текущего пользователя (доступны всем авторизованным, даже неактивным)
router.get(
  "/profile/me",
  authenticateWithoutActivationCheck,
  userController.getMyProfile,
);
router.put(
  "/profile/me",
  authenticateWithoutActivationCheck,
  [
    body("firstName").optional().notEmpty().trim(),
    body("email").optional().isEmail().normalizeEmail(),
    body("userLanguage").optional().isIn(["ru", "uz", "tj", "kz"]),
  ],
  validate,
  userController.updateMyProfile,
);
router.post(
  "/profile/change-password",
  authenticateWithoutActivationCheck,
  [
    body("currentPassword")
      .notEmpty()
      .withMessage("Необходимо указать текущий пароль"),
    body("newPassword")
      .isLength({ min: PASSWORD_MIN_LENGTH })
      .withMessage(getPasswordMinLengthMessage("Новый пароль")),
  ],
  validate,
  userController.changeMyPassword,
);

// Остальные маршруты требуют активного пользователя и роли admin
router.use(authenticate);
router.use(authorize("admin"));

// Validation rules
const createUserValidation = [
  body("email").isEmail().normalizeEmail(),
  body("password")
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(getPasswordMinLengthMessage("Пароль")),
  body("firstName").notEmpty().trim(),
  body("counterpartyId")
    .notEmpty()
    .withMessage("Необходимо выбрать компанию")
    .bail()
    .isUUID()
    .withMessage("counterpartyId должен быть UUID"),
  body("lastName").optional().trim(),
  body("role")
    .optional()
    .isIn(["admin", "user", "laborer", "ot_engineer", "ot_admin", "manager"]),
  body("userLanguage").optional().isIn(["ru", "uz", "tj", "kz"]),
];

const updateUserValidation = [
  body("email").optional().isEmail().normalizeEmail(),
  body("firstName").optional().notEmpty().trim(),
  body("lastName").optional().trim(),
  body("role")
    .optional()
    .isIn(["admin", "user", "laborer", "ot_engineer", "ot_admin", "manager"]),
  body("userLanguage").optional().isIn(["ru", "uz", "tj", "kz"]),
];

const updatePasswordValidation = [
  body("newPassword")
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(getPasswordMinLengthMessage("Новый пароль")),
  body("currentPassword").optional().notEmpty(),
];

const idParamValidation = [
  param("id").isUUID().withMessage("id должен быть UUID"),
];

// Routes
router.get("/deleted", userController.getDeletedUsers);
router.post(
  "/:id/restore",
  idParamValidation,
  validate,
  userController.restoreUser,
);
router.delete(
  "/:id/permanent",
  idParamValidation,
  validate,
  userController.permanentlyDeleteUser,
);
router.get("/", userController.getAllUsers);
router.get("/:id", idParamValidation, validate, userController.getUserById);
router.post("/", createUserValidation, validate, userController.createUser);
router.put(
  "/:id",
  idParamValidation,
  updateUserValidation,
  validate,
  userController.updateUser,
);
router.delete("/:id", idParamValidation, validate, userController.deleteUser);
router.patch(
  "/:id/password",
  idParamValidation,
  updatePasswordValidation,
  validate,
  userController.updatePassword,
);
router.patch(
  "/:id/toggle-status",
  idParamValidation,
  validate,
  userController.toggleUserStatus,
);

export default router;
