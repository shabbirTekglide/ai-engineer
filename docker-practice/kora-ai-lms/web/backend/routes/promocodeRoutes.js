import express from 'express';
import {
  getAllPromoCodes,
  createNewPromoCode,
  updatePromoCode,
  getPromoCodeDetailById,
  deletePromoCode,
  getAllUsers,
  applyPromoCode
} from '../controllers/promocodeController.js';
import {
  applyPromoCodeSchema,
  promoCodeSchema,
  updatePromoCodeSchema
} from '../validations/promocode.validation.js';
import { validateBody } from '../middleware/validate.js';
import { protectedDashboard } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes here are admin only
router.get('/', protectedDashboard('admin'), getAllPromoCodes);
router.get('/users/all', protectedDashboard('admin'), getAllUsers);
router.get('/:id', protectedDashboard('admin'), getPromoCodeDetailById);
router.post('/', protectedDashboard('admin'), validateBody(promoCodeSchema), createNewPromoCode);
router.put('/:id', protectedDashboard('admin'), validateBody(updatePromoCodeSchema), updatePromoCode);
router.delete('/:id', protectedDashboard('admin'), deletePromoCode);
router.post('/apply', protectedDashboard('student'), validateBody(applyPromoCodeSchema), applyPromoCode);
export default router;
