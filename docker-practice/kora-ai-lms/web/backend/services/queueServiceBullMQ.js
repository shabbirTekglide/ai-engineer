/**
 * Queue Service (BullMQ Version)
 * ==============================
 * 
 * BullMQ-based queue service that provides the same interface as the legacy
 * MongoDB-based queue service but uses Redis for distributed processing.
 * 
 * Features:
 * - Full compatibility with existing API
 * - Redis-backed distributed queue
 * - Concurrent processing for 100+ users
 * - Real-time progress tracking via Redis Pub/Sub
 * - Automatic retry with exponential backoff
 * - Job prioritization
 * 
 * This service can be used as a drop-in replacement for the legacy queueService
 */

import { EventEmitter } from 'events';
import ProcessingJob from '../models/processingJob.js';
import Lecture from '../models/lecture.js';
import {
  createProcessingJob,
  getJobProgress,
  subscribeToJobEvents,
  getQueue,
  getJob,
  retryJob as bullMQRetryJob,
  removeJob,
  getAllQueueStats,
  QUEUE_NAMES
} from './bullmq/index.js';

class QueueServiceBullMQ extends EventEmitter {
  constructor() {
    super();
    this.isInitialized = false;
  }

  /**
   * Initialize the queue service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('[QueueService:BullMQ] Initializing...');

    // Reset stale MongoDB jobs on startup (for compatibility)
    await this.resetStaleJobs();

    this.isInitialized = true;
    console.log('[QueueService:BullMQ] Initialized successfully');
  }

  /**
   * Create a new processing job
   * Adds job to BullMQ and creates MongoDB tracking record
   */
  async createJob(lectureId, ownerId, classId, metadata = {}) {
    try {
      let existingJob = await ProcessingJob.findOne({
        lectureId,
        status: { $in: ['queued', 'processing'] }
      }).sort({ queuedAt: -1 });

      if (!existingJob) {
        existingJob = await ProcessingJob.findOne({ lectureId }).sort({ updatedAt: -1 });
      }

      if (existingJob) {
        await ProcessingJob.deleteMany({ lectureId, _id: { $ne: existingJob._id } });
      }

      if (existingJob) {
        // If the job failed and can be retried, reset it
        if (existingJob.status === 'failed' && existingJob.canRetry()) {
          await existingJob.retry();
          console.log(`[QueueService:BullMQ] Retrying existing job for lecture: ${lectureId}`);
          
          // Also add to BullMQ
          await createProcessingJob({
            lectureId,
            ownerId,
            classId,
            metadata
          }, {
            priority: 1 // Higher priority for retries
          });
          
          this.emit('job:retried', existingJob);
          return existingJob;
        }
        
        // If job is already queued or processing, return it
        if (existingJob.status === 'queued' || existingJob.status === 'processing') {
          console.log(`[QueueService:BullMQ] Job already exists for lecture: ${lectureId}, status: ${existingJob.status}`);
          return existingJob;
        }

        await existingJob.resetForFullReprocess(metadata);

        await Lecture.findByIdAndUpdate(lectureId, {
          processingStatus: 'pending'
        });

        const bullMQJob = await createProcessingJob({
          lectureId: lectureId.toString(),
          ownerId: ownerId.toString(),
          classId: classId.toString(),
          metadata: {
            ...metadata,
            mongoJobId: existingJob._id.toString()
          }
        });

        console.log(`[QueueService:BullMQ] Reprocess job for lecture: ${lectureId}`);
        console.log(`  MongoDB Job ID: ${existingJob._id}`);
        console.log(`  BullMQ Job ID: ${bullMQJob.jobId}`);

        this.emit('job:created', existingJob);
        return existingJob;
      }

      // Create MongoDB job record for tracking
      const mongoJob = await ProcessingJob.createJob(lectureId, ownerId, classId, metadata);
      
      // Add to BullMQ for actual processing
      const bullMQJob = await createProcessingJob({
        lectureId: lectureId.toString(),
        ownerId: ownerId.toString(),
        classId: classId.toString(),
        metadata: {
          ...metadata,
          mongoJobId: mongoJob._id.toString()
        }
      });

      // Update lecture status
      await Lecture.findByIdAndUpdate(lectureId, {
        processingStatus: 'pending'
      });

      console.log(`[QueueService:BullMQ] Created job for lecture: ${lectureId}`);
      console.log(`  MongoDB Job ID: ${mongoJob._id}`);
      console.log(`  BullMQ Job ID: ${bullMQJob.jobId}`);
      
      // Emit event
      this.emit('job:created', mongoJob);
      
      return mongoJob;
    } catch (error) {
      console.error('[QueueService:BullMQ] Error creating job:', error);
      throw error;
    }
  }

  /**
   * Get next job to process (for backward compatibility)
   * BullMQ handles this internally, but we keep the interface
   */
  async getNextJob() {
    try {
      return await ProcessingJob.getNextJob();
    } catch (error) {
      console.error('[QueueService:BullMQ] Error getting next job:', error);
      return null;
    }
  }

  /**
   * Get job by ID
   */
  async getJobById(jobId) {
    try {
      return await ProcessingJob.findById(jobId)
        .populate('lectureId', 'title recordedAt audioUrl')
        .populate('classId', 'name code')
        .exec();
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error getting job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get job by lecture ID
   */
  async getJobByLectureId(lectureId) {
    try {
      const doc = await ProcessingJob.findPrimaryByLectureId(lectureId);
      const mongoJob = doc
        ? await ProcessingJob.findById(doc._id)
            .populate('classId', 'name code')
            .exec()
        : null;

      if (mongoJob) {
        // Also get BullMQ progress
        const bullMQProgress = await getJobProgress(lectureId.toString());
        if (bullMQProgress) {
          // Merge BullMQ progress with MongoDB job
          mongoJob._bullMQProgress = bullMQProgress;
        }
      }

      return mongoJob;
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error getting job for lecture ${lectureId}:`, error);
      return null;
    }
  }

  /**
   * Get all jobs for a user
   */
  async getUserJobs(ownerId, options = {}) {
    try {
      return await ProcessingJob.getUserJobs(ownerId, options);
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error getting jobs for user ${ownerId}:`, error);
      return [];
    }
  }

  /**
   * Update job progress
   */
  async updateJobProgress(jobId, stageName, progress, details = {}) {
    try {
      const job = await ProcessingJob.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      await job.updateStage(stageName, {
        status: 'in_progress',
        progress,
        details
      });

      // Emit progress event
      this.emit('job:progress', {
        jobId: job._id,
        lectureId: job.lectureId,
        stageName,
        progress,
        overallProgress: job.overallProgress,
        details
      });

      return job;
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error updating job progress for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Complete a job stage
   */
  async completeJobStage(jobId, stageName, details = {}) {
    try {
      const job = await ProcessingJob.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      await job.updateStage(stageName, {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        details
      });

      console.log(`[QueueService:BullMQ] Stage ${stageName} completed for job ${jobId}`);

      // Emit stage completion event
      this.emit('job:stage-completed', {
        jobId: job._id,
        lectureId: job.lectureId,
        stageName,
        overallProgress: job.overallProgress
      });

      return job;
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error completing stage ${stageName} for job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Fail a job stage
   */
  async failJobStage(jobId, stageName, error) {
    try {
      const job = await ProcessingJob.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      await job.updateStage(stageName, {
        status: 'failed',
        error: error.message || String(error)
      });

      console.log(`[QueueService:BullMQ] Stage ${stageName} failed for job ${jobId}: ${error.message}`);

      // Emit stage failure event
      this.emit('job:stage-failed', {
        jobId: job._id,
        lectureId: job.lectureId,
        stageName,
        error: error.message
      });

      return job;
    } catch (err) {
      console.error(`[QueueService:BullMQ] Error failing stage ${stageName} for job ${jobId}:`, err);
      throw err;
    }
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId) {
    try {
      const job = await ProcessingJob.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      await job.markAsCompleted();

      // Update lecture status
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'completed'
      });

      console.log(`[QueueService:BullMQ] Job ${jobId} completed successfully`);

      // Emit completion event
      this.emit('job:completed', {
        jobId: job._id,
        lectureId: job.lectureId,
        ownerId: job.ownerId
      });

      return job;
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error completing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, error, failedStage = null) {
    try {
      const job = await ProcessingJob.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      await job.markAsFailed(error, failedStage);

      // Update lecture status
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'failed',
        processingError: error.message || String(error)
      });

      console.log(`[QueueService:BullMQ] Job ${jobId} failed: ${error.message}`);

      // Emit failure event
      this.emit('job:failed', {
        jobId: job._id,
        lectureId: job.lectureId,
        ownerId: job.ownerId,
        error: error.message,
        failedStage: failedStage || job.currentStage
      });

      return job;
    } catch (err) {
      console.error(`[QueueService:BullMQ] Error failing job ${jobId}:`, err);
      throw err;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId) {
    try {
      const job = await ProcessingJob.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      job.status = 'cancelled';
      job.completedAt = new Date();
      await job.save();

      // Try to remove from BullMQ
      try {
        const bullMQJobId = `pipeline-${job.lectureId}`;
        await removeJob(QUEUE_NAMES.PIPELINE, bullMQJobId);
      } catch (bullMQError) {
        console.warn(`[QueueService:BullMQ] Could not remove BullMQ job:`, bullMQError.message);
      }

      // Update lecture status
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'cancelled'
      });

      console.log(`[QueueService:BullMQ] Job ${jobId} cancelled`);

      // Emit cancellation event
      this.emit('job:cancelled', {
        jobId: job._id,
        lectureId: job.lectureId,
        ownerId: job.ownerId
      });

      return job;
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error cancelling job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId) {
    try {
      const job = await ProcessingJob.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (!job.canRetry()) {
        throw new Error('Job cannot be retried');
      }

      await job.retry();

      // Add back to BullMQ
      await createProcessingJob({
        lectureId: job.lectureId.toString(),
        ownerId: job.ownerId.toString(),
        classId: job.classId.toString(),
        metadata: job.metadata
      }, {
        priority: 1 // Higher priority for retries
      });

      // Update lecture status
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'pending',
        processingError: null
      });

      console.log(`[QueueService:BullMQ] Job ${jobId} queued for retry (attempt ${job.retryCount}/${job.maxRetries})`);

      // Emit retry event
      this.emit('job:retried', job);

      return job;
    } catch (error) {
      console.error(`[QueueService:BullMQ] Error retrying job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Reset stale jobs (jobs that were processing but worker died)
   */
  async resetStaleJobs(staleThresholdMinutes = 5) {
    try {
      const staleJobs = await ProcessingJob.findStaleJobs(staleThresholdMinutes);
      
      if (staleJobs.length === 0) {
        return 0;
      }

      console.log(`[QueueService:BullMQ] Found ${staleJobs.length} stale jobs, resetting...`);

      let resetCount = 0;
      for (const job of staleJobs) {
        // Reset to queued if can retry
        if (job.canRetry()) {
          job.status = 'queued';
          job.workerInstanceId = null;
          job.retryCount += 1;
          await job.save();
          
          // Re-add to BullMQ
          try {
            await createProcessingJob({
              lectureId: job.lectureId.toString(),
              ownerId: job.ownerId.toString(),
              classId: job.classId.toString(),
              metadata: job.metadata
            });
          } catch (bullMQError) {
            console.warn(`[QueueService:BullMQ] Could not re-add stale job to BullMQ:`, bullMQError.message);
          }
          
          resetCount++;
          console.log(`[QueueService:BullMQ] Reset stale job ${job._id} to queued`);
        } else {
          // Mark as failed if max retries reached
          await job.markAsFailed(new Error('Job stale - worker died or timed out'));
          console.log(`[QueueService:BullMQ] Marked stale job ${job._id} as failed (max retries reached)`);
        }
      }

      return resetCount;
    } catch (error) {
      console.error('[QueueService:BullMQ] Error resetting stale jobs:', error);
      return 0;
    }
  }

  /**
   * Get queue statistics (combined MongoDB and BullMQ)
   */
  async getQueueStats() {
    try {
      // Get MongoDB stats
      const mongoStats = await ProcessingJob.getQueueStats();
      
      // Get BullMQ stats
      let bullMQStats = {};
      try {
        bullMQStats = await getAllQueueStats();
      } catch (bullMQError) {
        console.warn('[QueueService:BullMQ] Could not get BullMQ stats:', bullMQError.message);
      }

      return {
        ...mongoStats,
        bullmq: bullMQStats
      };
    } catch (error) {
      console.error('[QueueService:BullMQ] Error getting queue stats:', error);
      return {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0
      };
    }
  }

  /**
   * Subscribe to job events for a specific lecture
   */
  subscribeToLectureProgress(lectureId, callback) {
    return subscribeToJobEvents(lectureId, callback);
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    console.log('[QueueService:BullMQ] Shutting down...');
    this.removeAllListeners();
    this.isInitialized = false;
    console.log('[QueueService:BullMQ] Shut down');
  }
}

// Export singleton instance
const queueServiceBullMQ = new QueueServiceBullMQ();
export default queueServiceBullMQ;

