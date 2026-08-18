/**
 * Transcription Routes
 * ===================
 * 
 * Routes for transcription processing and progress tracking
 * Provides real-time updates and status monitoring
 */

import express from "express";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { validateParams } from "../middleware/validate.js";
import { objectIdParam } from "../validations/common.validation.js";
import { 
  getTranscriptionStatus, 
  getTranscriptionProgress,
  retryTranscription,
  cancelTranscription 
} from "../controllers/transcriptionController.js";

const router = express.Router();

/**
 * GET /api/transcription/:lectureId/status
 * Get transcription processing status
 */
router.get(
  "/:lectureId/status",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  getTranscriptionStatus
);

/**
 * GET /api/transcription/:lectureId/progress
 * Get real-time transcription progress (WebSocket-like endpoint)
 */
router.get(
  "/:lectureId/progress",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  getTranscriptionProgress
);

/**
 * POST /api/transcription/:lectureId/retry
 * Retry failed transcription
 */
router.post(
  "/:lectureId/retry",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  retryTranscription
);

/**
 * DELETE /api/transcription/:lectureId/cancel
 * Cancel ongoing transcription
 */
router.delete(
  "/:lectureId/cancel",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  cancelTranscription
);

export default router;
