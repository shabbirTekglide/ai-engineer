// routes/comprehensionRoutes.js
import express from "express";
import multer from "multer";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { assessComprehension, assessComprehensionText } from "../controllers/comprehensionController.js";
import restrictFreeTrial from "../middleware/trialRestriction.js";

const router = express.Router();

// Memory storage for direct audio processing
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for audio
});

/**
 * POST /api/comprehension/assess
 * Speech-to-speech comprehension assessment for multiple lectures
 * Accepts audio question, classId, and lectureIds array, returns audio response
 */
router.post(
  "/assess",
  protectedDashboard(),
  restrictFreeTrial,
  upload.single("audio"),  // expects field name 'audio'
  assessComprehension
);

/**
 * POST /api/comprehension/assess-text
 * Text-based comprehension assessment for multiple lectures
 * Accepts text question, classId, lectureIds array, and optional includeAudio flag
 * Returns text response (and optionally base64 encoded audio)
 */
router.post(
  "/assess-text",
  protectedDashboard(),
  restrictFreeTrial,
  assessComprehensionText
);

export default router;

