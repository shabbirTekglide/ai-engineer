// routes/classRoutes.js
import express from "express";
import { attachSyllabusCloud, createClass, deleteClass, extractClassFromSyllabus, getClassAndLectures, getClassById, getClasses, updateClass } from "../controllers/classController.js";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createClassSchema, updateClassSchema } from "../validations/class.validation.js";
import { objectIdParam } from "../validations/common.validation.js";
import { memoryUpload } from "../middleware/fileUploadMiddleware.js";
import restrictFreeTrial from "../middleware/trialRestriction.js";

const router = express.Router();

router.get("/", protectedDashboard(), getClasses);

router.get("/classLectures", protectedDashboard(), getClassAndLectures);

// ✅ validate route params, NOT body
router.get("/:classId", protectedDashboard(), validateParams(objectIdParam('classId')), getClassById);

// ✅ validate request body only for POST
router.post("/", protectedDashboard(), restrictFreeTrial, memoryUpload.single('syllabus'), validateBody(createClassSchema), createClass);

router.post(
  "/:classId/syllabus",
  protectedDashboard(),
  restrictFreeTrial,
  validateParams(objectIdParam('classId')),
  memoryUpload.single('file'),
  attachSyllabusCloud
);

router.post(
  "/syllabusExtractClass",
  protectedDashboard(),
  restrictFreeTrial,
  memoryUpload.single('file'),
  extractClassFromSyllabus
);

// Update class
router.put(
  "/:classId",
  protectedDashboard(),
  validateParams(objectIdParam('classId')),
  validateBody(updateClassSchema),
  updateClass
);

// Delete class
router.delete(
  "/:classId",
  protectedDashboard(),
  validateParams(objectIdParam('classId')),
  deleteClass
);

export default router;
