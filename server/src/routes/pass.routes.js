import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validator.js';
import { authenticate, authorize } from '../middleware/auth.js';
import * as passController from '../controllers/pass.controller.js';

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticate);

// Validation rules
const createPassValidation = [
  body('employeeId').isInt().withMessage('Employee ID must be an integer'),
  body('passType').notEmpty().trim(),
  body('validFrom').isISO8601().toDate(),
  body('validUntil').isISO8601().toDate(),
  body('accessZones').optional().isArray()
];

const updatePassValidation = [
  body('passType').optional().notEmpty().trim(),
  body('validFrom').optional().isISO8601().toDate(),
  body('validUntil').optional().isISO8601().toDate(),
  body('accessZones').optional().isArray(),
  body('status').optional().isIn(['pending', 'active', 'expired', 'revoked'])
];

// Routes
router.get('/', passController.getAllPasses);
router.get('/employee/:employeeId', passController.getPassesByEmployee);
router.get('/:id', passController.getPassById);
router.post('/', authorize('admin'), createPassValidation, validate, passController.createPass);
router.put('/:id', authorize('admin'), updatePassValidation, validate, passController.updatePass);
router.delete('/:id', authorize('admin'), passController.deletePass);
router.patch('/:id/revoke', authorize('admin'), passController.revokePass);

export default router;
