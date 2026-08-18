/**
 * BullMQ Service Index
 * ====================
 * 
 * Central export for all BullMQ functionality
 * Provides a unified interface for the queue system
 * 
 * Usage:
 * import { initializeBullMQ, addPipelineJob, getQueueStats } from './services/bullmq/index.js';
 */

import { testRedisConnection, closeAllConnections } from '../../config/redis.js';
import {
  QUEUE_NAMES,
  initializeQueues,
  addPipelineJob,
  addTranscriptionJob,
  addNotesJob,
  addQuizJob,
  addFlashcardsJob,
  getQueue,
  getQueueEvents,
  getQueueStats,
  getAllQueueStats,
  pauseQueue,
  resumeQueue,
  getJob,
  getJobState,
  retryJob,
  removeJob,
  cleanQueue,
  closeAllQueues
} from './queues.js';
import {
  initializeWorkers,
  getWorker,
  pauseAllWorkers,
  resumeAllWorkers,
  closeAllWorkers,
  getWorkersStatus,
  WORKER_CONFIG
} from './workers.js';

/**
 * Initialize the complete BullMQ system
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableWorkers - Whether to start workers (default: true)
 * @returns {Promise<boolean>} - Success status
 */
export async function initializeBullMQ(options = { enableWorkers: true }) {
  console.log('[BullMQ] Initializing BullMQ system...');

  try {
    // Test Redis connection first
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      console.error('[BullMQ] Redis connection failed. Queue system will not be available.');
      console.error('[BullMQ] Please ensure Redis is running or REDIS_URL environment variable is set.');
      return false;
    }

    // Initialize queues
    await initializeQueues();

    // Initialize workers if enabled
    if (options.enableWorkers) {
      await initializeWorkers();
    }

    console.log('[BullMQ] System initialized successfully');
    return true;

  } catch (error) {
    console.error('[BullMQ] Initialization failed:', error.message);
    return false;
  }
}

/**
 * Gracefully shutdown the BullMQ system
 */
export async function shutdownBullMQ() {
  console.log('[BullMQ] Shutting down...');

  try {
    // Close workers first (they should finish current jobs)
    await closeAllWorkers();

    // Close queues
    await closeAllQueues();

    // Close Redis connections
    await closeAllConnections();

    console.log('[BullMQ] Shutdown complete');

  } catch (error) {
    console.error('[BullMQ] Shutdown error:', error.message);
  }
}

/**
 * Get system health status
 */
export async function getSystemHealth() {
  try {
    const redisOk = await testRedisConnection();
    const workersStatus = getWorkersStatus();
    const queueStats = await getAllQueueStats();

    const totalActive = Object.values(queueStats).reduce((sum, q) => sum + q.active, 0);
    const totalWaiting = Object.values(queueStats).reduce((sum, q) => sum + q.waiting, 0);
    const totalFailed = Object.values(queueStats).reduce((sum, q) => sum + q.failed, 0);

    return {
      healthy: redisOk,
      redis: redisOk ? 'connected' : 'disconnected',
      workers: workersStatus,
      queues: queueStats,
      summary: {
        activeJobs: totalActive,
        waitingJobs: totalWaiting,
        failedJobs: totalFailed
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Add a job to process a lecture through the full AI pipeline
 * @param {Object} jobData - Job data
 * @param {string} jobData.lectureId - Lecture ID
 * @param {string} jobData.ownerId - Owner/User ID
 * @param {string} jobData.classId - Class ID
 * @param {Object} jobData.metadata - Additional metadata
 * @param {Object} options - Job options
 * @param {number} options.priority - Job priority (higher = processed first)
 * @returns {Promise<Object>} - Created job
 */
export async function createProcessingJob(jobData, options = {}) {
  const { lectureId, ownerId, classId, metadata = {} } = jobData;

  if (!lectureId || !ownerId || !classId) {
    throw new Error('Missing required fields: lectureId, ownerId, classId');
  }

  // Add job to pipeline queue
  const job = await addPipelineJob({
    lectureId: lectureId.toString(),
    ownerId: ownerId.toString(),
    classId: classId.toString(),
    metadata,
    createdAt: new Date().toISOString()
  }, {
    priority: options.priority || 0,
    ...options
  });

  return {
    jobId: job.id,
    queueName: QUEUE_NAMES.PIPELINE,
    lectureId,
    status: 'queued'
  };
}

/**
 * Get job progress for a lecture
 * @param {string} lectureId - Lecture ID
 * @returns {Promise<Object|null>} - Job progress or null
 */
export async function getJobProgress(lectureId) {
  try {
    const jobId = `pipeline-${lectureId}`;
    const job = await getJob(QUEUE_NAMES.PIPELINE, jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress || {};

    return {
      jobId: job.id,
      lectureId,
      state,
      progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason
    };

  } catch (error) {
    console.error('[BullMQ] Error getting job progress:', error.message);
    return null;
  }
}

/**
 * Subscribe to job events for real-time progress
 * @param {string} lectureId - Lecture ID
 * @param {Function} callback - Callback for events
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToJobEvents(lectureId, callback) {
  const events = getQueueEvents(QUEUE_NAMES.PIPELINE);
  const jobId = `pipeline-${lectureId}`;

  const progressHandler = async ({ jobId: eventJobId, data }) => {
    if (eventJobId === jobId) {
      callback({ type: 'progress', data });
    }
  };

  const completedHandler = async ({ jobId: eventJobId, returnvalue }) => {
    if (eventJobId === jobId) {
      callback({ type: 'completed', data: returnvalue });
    }
  };

  const failedHandler = async ({ jobId: eventJobId, failedReason }) => {
    if (eventJobId === jobId) {
      callback({ type: 'failed', error: failedReason });
    }
  };

  events.on('progress', progressHandler);
  events.on('completed', completedHandler);
  events.on('failed', failedHandler);

  // Return unsubscribe function
  return () => {
    events.off('progress', progressHandler);
    events.off('completed', completedHandler);
    events.off('failed', failedHandler);
  };
}

// Re-export everything
export {
  QUEUE_NAMES,
  WORKER_CONFIG,
  // Queue functions
  getQueue,
  getQueueEvents,
  addPipelineJob,
  addTranscriptionJob,
  addNotesJob,
  addQuizJob,
  addFlashcardsJob,
  getQueueStats,
  getAllQueueStats,
  pauseQueue,
  resumeQueue,
  getJob,
  getJobState,
  retryJob,
  removeJob,
  cleanQueue,
  // Worker functions
  getWorker,
  pauseAllWorkers,
  resumeAllWorkers,
  getWorkersStatus
};

export default {
  initializeBullMQ,
  shutdownBullMQ,
  getSystemHealth,
  createProcessingJob,
  getJobProgress,
  subscribeToJobEvents,
  QUEUE_NAMES,
  WORKER_CONFIG
};

