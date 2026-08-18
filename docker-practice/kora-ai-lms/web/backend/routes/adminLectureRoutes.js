import { Router } from 'express';
import { protectedDashboard } from '../middleware/authMiddleware.js';
import {
  getAdminLectureStats,
  listAdminLectures,
  getAdminLectureDetail,
} from '../controllers/adminLectureController.js';

const router = Router();

router.get('/stats', protectedDashboard('admin'), getAdminLectureStats);
router.get('/', protectedDashboard('admin'), listAdminLectures);
router.get('/:lectureId', protectedDashboard('admin'), getAdminLectureDetail);

export default router;
