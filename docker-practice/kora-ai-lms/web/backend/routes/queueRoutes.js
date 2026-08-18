/**
 * Queue Routes
 * ============
 * 
 * Routes for queue management and progress tracking
 * Provides endpoints for monitoring processing jobs
 */

import express from "express";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { validateParams } from "../middleware/validate.js";
import { objectIdParam } from "../validations/common.validation.js";
import {
  getUserJobs,
  getJobById,
  getJobByLectureId,
  getJobProgress,
  retryJob,
  cancelJob,
  getQueueStats,
  getSystemHealth,
  getWorkersStatus
} from "../controllers/queueController.js";

const router = express.Router();

/**
 * GET /api/queue/jobs
 * Get all jobs for the authenticated user
 */
router.get(
  "/jobs",
  protectedDashboard(),
  getUserJobs
);

/**
 * GET /api/queue/jobs/:jobId
 * Get specific job details
 */
router.get(
  "/jobs/:jobId",
  protectedDashboard(),
  validateParams(objectIdParam('jobId')),
  getJobById
);

/**
 * GET /api/queue/lecture/:lectureId/job
 * Get job for a specific lecture
 */
router.get(
  "/lecture/:lectureId/job",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  getJobByLectureId
);

/**
 * GET /api/queue/lecture/:lectureId/progress
 * Get real-time progress for a lecture (SSE endpoint)
 */
router.get(
  "/lecture/:lectureId/progress",
  protectedDashboard(),
  validateParams(objectIdParam('lectureId')),
  getJobProgress
);

/**
 * POST /api/queue/jobs/:jobId/retry
 * Retry a failed job
 */
router.post(
  "/jobs/:jobId/retry",
  protectedDashboard(),
  validateParams(objectIdParam('jobId')),
  retryJob
);

/**
 * DELETE /api/queue/jobs/:jobId/cancel
 * Cancel a queued or processing job
 */
router.delete(
  "/jobs/:jobId/cancel",
  protectedDashboard(),
  validateParams(objectIdParam('jobId')),
  cancelJob
);

/**
 * GET /api/queue/stats
 * Get queue statistics
 */
router.get(
  "/stats",
  protectedDashboard(),
  getQueueStats
);

/**
 * GET /api/queue/health
 * Get system health status (BullMQ, Redis, workers)
 */
router.get(
  "/health",
  protectedDashboard(),
  getSystemHealth
);

/**
 * GET /api/queue/workers
 * Get worker status
 */
router.get(
  "/workers",
  protectedDashboard(),
  getWorkersStatus
);

export default router;

