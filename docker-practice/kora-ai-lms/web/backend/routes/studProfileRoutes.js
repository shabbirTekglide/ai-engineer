import express from 'express';
import {
  isStudentProfileCreated,
  createStudentProfile,
  updateStudentProfile,
  getStudentProfile
} from '../controllers/studentProfileController.js';
import { studentProfileSchema, updateStudentProfileSchema } from '../validations/studprofile.validation.js';
import { protectedDashboard } from '../middleware/authMiddleware.js';
import { validateBody } from '../middleware/validate.js';
import { imageUpload, memoryUpload } from '../middleware/fileUploadMiddleware.js';

const router = express.Router();

// Check if profile exists
router.get('/check',protectedDashboard(), isStudentProfileCreated);

// Get student profile
router.get('/',protectedDashboard(), getStudentProfile);

// Create student profile
router.post(
  '/create',
  protectedDashboard(),
  imageUpload.single('profilePic'),
  validateBody(studentProfileSchema),
  createStudentProfile
);

// Update student profile
router.post(
  '/update',
    protectedDashboard(),
    imageUpload.single('profilePic'),
    validateBody(updateStudentProfileSchema),
  updateStudentProfile
);

export default router;