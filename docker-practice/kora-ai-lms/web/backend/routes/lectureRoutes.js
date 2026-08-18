import express from "express";
import multer from "multer";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { validateParams } from "../middleware/validate.js";
import { objectIdParam, lectureQuerySchema } from "../validations/common.validation.js";
import { createLecture, getLectureById, getLecturesByClass, reprocessLecture, batchLectureStatus, deleteLecture, createDocumentLecture } from "../controllers/lectureController.js";
import { audioUpload, documentUpload } from "../middleware/fileUploadMiddleware.js";
import restrictFreeTrial from "../middleware/trialRestriction.js";

const router = express.Router();

// memory storage for direct-to-Cloudinary streaming
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/classes/:classId/lectures
router.post(
  "/:classId/lectures",
  protectedDashboard(),
  restrictFreeTrial,
  validateParams(objectIdParam('classId')),
  // upload.single("file"),     // expects field name 'file'
  audioUpload.single('file'),
  createLecture
);
router.post(
  "/:classId/lectures/document",
  protectedDashboard(),
  restrictFreeTrial,
  validateParams(objectIdParam('classId')),
  // upload.single("file"),     // expects field name 'file'
  documentUpload.single('file'),
  createDocumentLecture
);
router.get(
  "/:classId/lectures",
  protectedDashboard(),
  validateParams(objectIdParam('classId')),
  getLecturesByClass
)
router.get(
  "/:lectureId/lecture",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  getLectureById,
)
router.post(
  "/reprocess/:lectureId",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  reprocessLecture
);

// POST /api/lecture/batch-status
// Efficiently poll statuses for multiple lectures at once
router.post(
  "/batch-status",
  protectedDashboard(),
  batchLectureStatus
);

router.delete(
  "/:lectureId",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  deleteLecture
);
export default router;
