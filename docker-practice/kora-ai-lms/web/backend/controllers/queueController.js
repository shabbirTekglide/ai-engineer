/**
 * Queue Controller
 * ================
 * 
 * Controller for queue management and progress tracking
 * Handles job status queries, user job lists, and queue operations
 * 
 * Supports both legacy MongoDB-based queue and BullMQ distributed queue
 */

import mongoose from "mongoose";
import queueService from "../services/queueService.js";
import ProcessingJob from "../models/processingJob.js";

// Lazy-load BullMQ for progress subscriptions
let bullMQModule = null;
async function getBullMQModule() {
  if (!bullMQModule) {
    try {
      bullMQModule = await import('../services/bullmq/index.js');
    } catch (error) {
      console.warn('[QueueController] BullMQ not available');
      bullMQModule = {};
    }
  }
  return bullMQModule;
}

/**
 * GET /api/queue/jobs
 * Get all jobs for the authenticated user
 */
export const getUserJobs = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { status, limit } = req.query;
    
    const options = {};
    if (status) options.status = status;
    if (limit) options.limit = parseInt(limit, 10);

    const jobs = await queueService.getUserJobs(ownerId, options);

    return res.status(200).json({
      success: true,
      jobs,
      count: jobs.length
    });

  } catch (err) {
    console.error('Get user jobs error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

/**
 * GET /api/queue/jobs/:jobId
 * Get specific job details
 */
export const getJobById = async (req, res) => {
  try {
    const { jobId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Invalid job ID" });
    }

    const job = await queueService.getJobById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Verify ownership
    if (job.ownerId.toString() !== ownerId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({
      success: true,
      job
    });

  } catch (err) {
    console.error('Get job by ID error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

/**
 * GET /api/queue/lecture/:lectureId/job
 * Get job for a specific lecture
 */
export const getJobByLectureId = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }

    const job = await queueService.getJobByLectureId(lectureId);

    if (!job) {
      return res.status(404).json({ 
        message: "No processing job found for this lecture",
        lectureId 
      });
    }

    // Verify ownership
    if (job.ownerId.toString() !== ownerId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({
      success: true,
      job
    });

  } catch (err) {
    console.error('Get job by lecture ID error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

/**
 * GET /api/queue/lecture/:lectureId/progress
 * Get real-time progress for a lecture (SSE endpoint)
 * Uses BullMQ events when available for real-time updates
 */
export const getJobProgress = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }

    const job = await queueService.getJobByLectureId(lectureId);

    if (!job) {
      return res.status(404).json({ 
        message: "No processing job found for this lecture" 
      });
    }

    // Verify ownership
    if (job.ownerId.toString() !== ownerId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Set up Server-Sent Events for real-time progress
    // NOTE: Always use SSE format — returning JSON breaks EventSource clients
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      jobId: job._id,
      lectureId: lectureId,
      distributed: true,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // If job is already in a terminal state, send that immediately and close
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      res.write(`data: ${JSON.stringify({
        type: 'completed',
        status: job.status,
        progress: job.overallProgress,
        error: job.error || null,
        source: 'mongodb',
        timestamp: new Date().toISOString()
      })}\n\n`);
      res.end();
      return;
    }

    let progressInterval;
    let unsubscribeBullMQ = null;

    // Try to subscribe to BullMQ events for real-time updates
    try {
      const bullMQ = await getBullMQModule();
      if (bullMQ.subscribeToJobEvents) {
        unsubscribeBullMQ = bullMQ.subscribeToJobEvents(lectureId, (event) => {
          try {
            if (event.type === 'progress') {
              res.write(`data: ${JSON.stringify({
                type: 'progress',
                jobId: job._id,
                lectureId: lectureId,
                status: 'processing',
                currentStage: event.data?.stage,
                stageProgress: event.data?.progress,
                source: 'bullmq',
                timestamp: new Date().toISOString()
              })}\n\n`);
            } else if (event.type === 'completed') {
              res.write(`data: ${JSON.stringify({
                type: 'completed',
                status: 'completed',
                progress: 100,
                source: 'bullmq',
                timestamp: new Date().toISOString()
              })}\n\n`);
              cleanup();
            } else if (event.type === 'failed') {
              res.write(`data: ${JSON.stringify({
                type: 'completed',
                status: 'failed',
                error: event.error,
                source: 'bullmq',
                timestamp: new Date().toISOString()
              })}\n\n`);
              cleanup();
            }
          } catch (err) {
            console.error('Error sending BullMQ event:', err);
          }
        });
        console.log(`[SSE] Subscribed to BullMQ events for lecture ${lectureId}`);
      }
    } catch (bullMQError) {
      console.warn('[SSE] BullMQ subscription not available:', bullMQError.message);
    }

    const sendProgress = async () => {
      try {
        const currentJob = await ProcessingJob.findById(job._id);
        
        if (!currentJob) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: 'Job not found',
            timestamp: new Date().toISOString()
          })}\n\n`);
          cleanup();
          return;
        }

        if (currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') {
          // Processing finished
          res.write(`data: ${JSON.stringify({
            type: 'completed',
            status: currentJob.status,
            progress: currentJob.overallProgress,
            error: currentJob.error,
            source: 'mongodb',
            timestamp: new Date().toISOString()
          })}\n\n`);
          
          cleanup();
          return;
        }

        // Send progress update from MongoDB
        const progressData = {
          type: 'progress',
          jobId: currentJob._id,
          lectureId: currentJob.lectureId,
          status: currentJob.status,
          currentStage: currentJob.currentStage,
          overallProgress: currentJob.overallProgress,
          stages: currentJob.stages,
          estimatedCompletionTime: currentJob.estimatedCompletionTime,
          source: 'mongodb',
          timestamp: new Date().toISOString()
        };

        res.write(`data: ${JSON.stringify(progressData)}\n\n`);
      } catch (error) {
        console.error('Error sending progress:', error);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
    };

    const cleanup = () => {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      if (unsubscribeBullMQ) {
        unsubscribeBullMQ();
        unsubscribeBullMQ = null;
      }
      res.end();
    };

    // Send progress updates every 2 seconds (fallback/supplement to BullMQ events)
    progressInterval = setInterval(sendProgress, 2000);

    // Send initial progress
    sendProgress();

    // Handle client disconnect
    req.on('close', () => {
      cleanup();
    });

  } catch (err) {
    console.error('Get job progress error:', err);
    
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: err.message
      });
    } else {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: err.message,
        timestamp: new Date().toISOString()
      })}\n\n`);
      res.end();
    }
  }
};

/**
 * POST /api/queue/jobs/:jobId/retry
 * Retry a failed job
 */
export const retryJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Invalid job ID" });
    }

    const job = await queueService.getJobById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Verify ownership
    if (job.ownerId.toString() !== ownerId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!job.canRetry()) {
      return res.status(400).json({ 
        message: "Job cannot be retried. Either it's not failed or max retries reached." 
      });
    }

    await queueService.retryJob(jobId);

    return res.status(200).json({
      success: true,
      message: "Job queued for retry",
      job
    });

  } catch (err) {
    console.error('Retry job error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

/**
 * DELETE /api/queue/jobs/:jobId/cancel
 * Cancel a queued or processing job
 */
export const cancelJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(jobId)) {
      return res.status(400).json({ message: "Invalid job ID" });
    }

    const job = await queueService.getJobById(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Verify ownership
    if (job.ownerId.toString() !== ownerId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (job.status !== 'queued' && job.status !== 'processing') {
      return res.status(400).json({ 
        message: `Job cannot be cancelled. Current status: ${job.status}` 
      });
    }

    await queueService.cancelJob(jobId);

    return res.status(200).json({
      success: true,
      message: "Job cancelled successfully"
    });

  } catch (err) {
    console.error('Cancel job error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

/**
 * GET /api/queue/stats
 * Get queue statistics (combined MongoDB and BullMQ)
 */
export const getQueueStats = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const stats = await queueService.getQueueStats();

    return res.status(200).json({
      success: true,
      stats
    });

  } catch (err) {
    console.error('Get queue stats error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

/**
 * GET /api/queue/health
 * Get system health status (BullMQ, Redis, workers)
 */
export const getSystemHealth = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const bullMQ = await getBullMQModule();
    
    if (bullMQ.getSystemHealth) {
      const health = await bullMQ.getSystemHealth();
      return res.status(200).json({
        success: true,
        ...health
      });
    }

    // Fallback if BullMQ not available
    const stats = await queueService.getQueueStats();
    return res.status(200).json({
      success: true,
      healthy: true,
      mode: 'legacy',
      redis: 'not-configured',
      queues: stats,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Get system health error:', err);
    return res.status(500).json({
      success: false,
      healthy: false,
      message: "Server error",
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * GET /api/queue/workers
 * Get worker status
 */
export const getWorkersStatus = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const bullMQ = await getBullMQModule();
    
    if (bullMQ.getWorkersStatus) {
      const workersStatus = bullMQ.getWorkersStatus();
      return res.status(200).json({
        success: true,
        workers: workersStatus,
        timestamp: new Date().toISOString()
      });
    }

    // Fallback if BullMQ not available
    return res.status(200).json({
      success: true,
      workers: {},
      mode: 'legacy',
      message: 'Using legacy single-worker mode',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Get workers status error:', err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

