import express from 'express';
import {
  createReferenceCode,
  deleteReferenceCode,
  getAllReferenceCodes,
  getAllUsers,
  getReferenceCodeDetailById,
  importReferenceCodes,
  updateReferenceCode,
  getAttributionReport
} from '../controllers/referenceCodeController.js';
import {
  referenceCodeSchema,
  updateReferenceCodeSchema
} from '../validations/referenceCode.validation.js';
import { validateBody } from '../middleware/validate.js';
import { protectedDashboard } from '../middleware/authMiddleware.js';
import { spreadsheetUpload } from '../middleware/fileUploadMiddleware.js';

const router = express.Router();

router.get('/', protectedDashboard('admin'), getAllReferenceCodes);
router.get('/users/all', protectedDashboard('admin'), getAllUsers);
router.get('/attribution/report', protectedDashboard('admin'), getAttributionReport);
router.get('/:id', protectedDashboard('admin'), getReferenceCodeDetailById);
router.post('/import', protectedDashboard('admin'), spreadsheetUpload.single('file'), importReferenceCodes);
router.post('/', protectedDashboard('admin'), validateBody(referenceCodeSchema), createReferenceCode);
router.put('/:id', protectedDashboard('admin'), validateBody(updateReferenceCodeSchema), updateReferenceCode);

router.delete('/:id', protectedDashboard('admin'), deleteReferenceCode);

export default router;
