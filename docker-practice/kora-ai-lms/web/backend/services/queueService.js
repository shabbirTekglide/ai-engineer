/**
 * Queue Service
 * =============
 * 
 * Service for managing the processing queue
 * Handles job creation, retrieval, and queue operations
 * 
 * Features:
 * - Create and manage processing jobs
 * - Monitor queue health
 * - Handle job priorities
 * - Track processing progress
 * 
 * NOTE: This service now integrates with BullMQ for distributed processing.
 * When Redis is available, jobs are added to both MongoDB (for tracking)
 * and BullMQ (for distributed processing). Falls back to MongoDB-only
 * when Redis is not available.
 */

import ProcessingJob from '../models/processingJob.js';
import Lecture from '../models/lecture.js';
import { EventEmitter } from 'events';

// BullMQ integration (lazy-loaded to avoid startup errors if Redis is not configured)
let bullMQService = null;
let bullMQAvailable = false;

async function initializeBullMQIntegration() {
  if (bullMQService !== null) return bullMQAvailable;
  
  try {
    const { createProcessingJob, getJobProgress, subscribeToJobEvents, getAllQueueStats, removeJob, QUEUE_NAMES } = await import('./bullmq/index.js');
    bullMQService = { createProcessingJob, getJobProgress, subscribeToJobEvents, getAllQueueStats, removeJob, QUEUE_NAMES };
    bullMQAvailable = true;
    console.log('[QueueService] BullMQ integration enabled');
  } catch (error) {
    bullMQService = {};
    bullMQAvailable = false;
    console.log('[QueueService] BullMQ not available, using MongoDB-only queue');
  }
  
  return bullMQAvailable;
}

class QueueService extends EventEmitter {
  constructor() {
    super();
    this.isInitialized = false;
    this.useBullMQ = false;
  }

  /**
   * Initialize the queue service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('Initializing Queue Service...');

    // Try to initialize BullMQ integration
    this.useBullMQ = await initializeBullMQIntegration();
    
    if (this.useBullMQ) {
      console.log('[QueueService] Using BullMQ for distributed processing');
    } else {
      console.log('[QueueService] Using MongoDB-only queue (legacy mode)');
    }

    // Reset stale jobs on startup
    await this.resetStaleJobs();

    // Lectures stuck in "processing" with no live Redis job (e.g. after stale reset)
    await this.recoverOrphanedProcessingLectures();

    // Start periodic health check
    this.startHealthCheck();

    this.isInitialized = true;
    console.log('Queue Service initialized successfully');
  }

  /**
   * Create a new processing job
   * When BullMQ is available, creates job in both MongoDB (for tracking) and BullMQ (for processing)
   */
  async createJob(lectureId, ownerId, classId, metadata = {}) {
    try {
      // Ensure BullMQ integration is initialized (lazy initialization)
      if (!this.isInitialized) {
        await initializeBullMQIntegration();
        this.useBullMQ = bullMQAvailable;
      }

      // One processing job per lecture; prefer active queue rows, then latest update
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
          console.log(`Retrying existing job for lecture: ${lectureId}`);
          
          // Also add to BullMQ if available
          if (bullMQAvailable && bullMQService?.createProcessingJob) {
            try {
              await bullMQService.createProcessingJob({
                lectureId: lectureId.toString(),
                ownerId: ownerId.toString(),
                classId: classId.toString(),
                metadata
              }, { priority: 1 }); // Higher priority for retries
              console.log(`[BullMQ] Retry job added to distributed queue`);
            } catch (bullMQError) {
              console.warn('[BullMQ] Failed to add retry job:', bullMQError.message);
            }
          }
          
          this.emit('job:retried', existingJob);
          return existingJob;
        }
        
        // If job is already queued or processing, ensure BullMQ still has a live job.
        if (existingJob.status === 'queued' || existingJob.status === 'processing') {
          if (bullMQAvailable && bullMQService?.createProcessingJob) {
            try {
              const { getJobState, removeJob, QUEUE_NAMES } = await import('./bullmq/queues.js');
              const bullJobId = `pipeline-${lectureId}`;
              const redisState = await getJobState(QUEUE_NAMES.PIPELINE, bullJobId);

              if (!redisState || redisState === 'completed' || redisState === 'failed') {
                if (redisState) {
                  await removeJob(QUEUE_NAMES.PIPELINE, bullJobId);
                }
                await bullMQService.createProcessingJob({
                  lectureId: lectureId.toString(),
                  ownerId: ownerId.toString(),
                  classId: classId.toString(),
                  metadata: {
                    ...metadata,
                    mongoJobId: existingJob._id.toString()
                  }
                }, { priority: 1, force: true });
                console.log(`[BullMQ] Re-queued orphan job for lecture ${lectureId} (mongo=${existingJob.status}, redis=${redisState || 'missing'})`);
              }
            } catch (bullMQError) {
              console.warn(`[BullMQ] Could not verify/re-queue job for ${lectureId}:`, bullMQError.message);
            }
          }
          console.log(`Job already exists for lecture: ${lectureId}, status: ${existingJob.status}`);
          return existingJob;
        }

        // Completed, failed (retries exhausted), or cancelled — full reprocess on same document
        await existingJob.resetForFullReprocess(metadata);

        await Lecture.findByIdAndUpdate(lectureId, {
          processingStatus: 'pending'
        });

        if (bullMQAvailable && bullMQService?.createProcessingJob) {
          try {
            await bullMQService.createProcessingJob({
              lectureId: lectureId.toString(),
              ownerId: ownerId.toString(),
              classId: classId.toString(),
              metadata: {
                ...metadata,
                mongoJobId: existingJob._id.toString()
              }
            });
            console.log(`[BullMQ] Reprocess job added to distributed queue`);
          } catch (bullMQError) {
            console.warn('[BullMQ] Failed to add job to distributed queue:', bullMQError.message);
            console.warn('[BullMQ] Job will be processed by legacy worker');
          }
        } else {
          console.log(`[QueueService] BullMQ not available, job will use legacy processing`);
        }

        this.emit('job:created', existingJob);
        return existingJob;
      }

      // Create new job in MongoDB for tracking
      const job = await ProcessingJob.createJob(lectureId, ownerId, classId, metadata);
      
      // Update lecture status
      await Lecture.findByIdAndUpdate(lectureId, {
        processingStatus: 'pending'
      });

      console.log(`Created processing job for lecture: ${lectureId}, job ID: ${job._id}`);
      
      // Add to BullMQ for distributed processing if available
      if (bullMQAvailable && bullMQService?.createProcessingJob) {
        try {
          const bullMQJob = await bullMQService.createProcessingJob({
            lectureId: lectureId.toString(),
            ownerId: ownerId.toString(),
            classId: classId.toString(),
            metadata: {
              ...metadata,
              mongoJobId: job._id.toString()
            }
          });
          console.log(`[BullMQ] Job added to distributed queue: ${bullMQJob.jobId}`);
        } catch (bullMQError) {
          console.warn('[BullMQ] Failed to add job to distributed queue:', bullMQError.message);
          console.warn('[BullMQ] Job will be processed by legacy worker');
        }
      } else {
        console.log(`[QueueService] BullMQ not available, job will use legacy processing`);
      }
      
      // Emit event for workers to pick up (legacy support)
      this.emit('job:created', job);
      
      return job;
    } catch (error) {
      console.error('Error creating processing job:', error);
      throw error;
    }
  }

  /**
   * Get next job to process
   */
  async getNextJob() {
    try {
      return await ProcessingJob.getNextJob();
    } catch (error) {
      console.error('Error getting next job:', error);
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
      console.error(`Error getting job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get job by lecture ID
   */
  async getJobByLectureId(lectureId) {
    try {
      const doc = await ProcessingJob.findPrimaryByLectureId(lectureId);
      if (!doc) return null;
      return await ProcessingJob.findById(doc._id)
        .populate('classId', 'name code')
        .exec();
    } catch (error) {
      console.error(`Error getting job for lecture ${lectureId}:`, error);
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
      console.error(`Error getting jobs for user ${ownerId}:`, error);
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
      console.error(`Error updating job progress for ${jobId}:`, error);
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
        error: null, // Clear any previous error on this stage
        details
      });

      console.log(`Stage ${stageName} completed for job ${jobId}`);

      // Emit stage completion event
      this.emit('job:stage-completed', {
        jobId: job._id,
        lectureId: job.lectureId,
        stageName,
        overallProgress: job.overallProgress
      });

      return job;
    } catch (error) {
      console.error(`Error completing stage ${stageName} for job ${jobId}:`, error);
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

      console.log(`Stage ${stageName} failed for job ${jobId}: ${error.message}`);

      // Emit stage failure event
      this.emit('job:stage-failed', {
        jobId: job._id,
        lectureId: job.lectureId,
        stageName,
        error: error.message
      });

      return job;
    } catch (err) {
      console.error(`Error failing stage ${stageName} for job ${jobId}:`, err);
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

      // Update lecture status - ensure we clear any previous error state
      // This handles the case where a job was marked as stale but then completed
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'completed',
        processingError: null
      });

      console.log(`Job ${jobId} completed successfully`);

      // Emit completion event
      this.emit('job:completed', {
        jobId: job._id,
        lectureId: job.lectureId,
        ownerId: job.ownerId
      });

      return job;
    } catch (error) {
      console.error(`Error completing job ${jobId}:`, error);
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

      console.log(`Job ${jobId} failed: ${error.message}`);

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
      console.error(`Error failing job ${jobId}:`, err);
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

      // Try to remove from BullMQ if available
      if (bullMQAvailable && bullMQService?.removeJob && bullMQService?.QUEUE_NAMES) {
        try {
          const bullMQJobId = `pipeline-${job.lectureId}`;
          await bullMQService.removeJob(bullMQService.QUEUE_NAMES.PIPELINE, bullMQJobId);
          console.log(`[BullMQ] Job removed from distributed queue`);
        } catch (bullMQError) {
          console.warn('[BullMQ] Failed to remove job from distributed queue:', bullMQError.message);
        }
      }

      // Update lecture status
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'cancelled'
      });

      console.log(`Job ${jobId} cancelled`);

      // Emit cancellation event
      this.emit('job:cancelled', {
        jobId: job._id,
        lectureId: job.lectureId,
        ownerId: job.ownerId
      });

      return job;
    } catch (error) {
      console.error(`Error cancelling job ${jobId}:`, error);
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

      // Add back to BullMQ if available
      if (bullMQAvailable && bullMQService?.createProcessingJob) {
        try {
          await bullMQService.createProcessingJob({
            lectureId: job.lectureId.toString(),
            ownerId: job.ownerId.toString(),
            classId: job.classId.toString(),
            metadata: job.metadata
          }, { priority: 1 }); // Higher priority for retries
          console.log(`[BullMQ] Retry job added to distributed queue`);
        } catch (bullMQError) {
          console.warn('[BullMQ] Failed to add retry job:', bullMQError.message);
        }
      }

      // Update lecture status
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'pending',
        processingError: null
      });

      console.log(`Job ${jobId} queued for retry (attempt ${job.retryCount}/${job.maxRetries})`);

      // Emit retry event
      this.emit('job:retried', job);

      return job;
    } catch (error) {
      console.error(`Error retrying job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Reset stale jobs (jobs that were processing but worker died)
   */
  async resetStaleJobs(staleThresholdMinutes) {
    try {
      const provider = process.env.ACTIVE_TRANSCRIPTION_PROVIDER || 'mistral';
      const defaultStale =
        provider === 'velma'
          ? parseInt(process.env.STALE_JOB_THRESHOLD_MINUTES, 10) || 60
          : parseInt(process.env.STALE_JOB_THRESHOLD_MINUTES, 10) || 15;
      const threshold = staleThresholdMinutes ?? defaultStale;

      const staleJobs = await ProcessingJob.findStaleJobs(threshold);
      
      if (staleJobs.length === 0) {
        return 0;
      }

      console.log(`Found ${staleJobs.length} stale jobs (threshold ${threshold}m), resetting...`);

      if (!this.isInitialized) {
        await initializeBullMQIntegration();
        this.useBullMQ = bullMQAvailable;
      }

      let resetCount = 0;
      for (const job of staleJobs) {
        // Check if job can still be retried (retryCount < maxRetries)
        // Note: We check retry count directly since job.canRetry() requires status='failed'
        const canRetryStaleJob = job.retryCount < job.maxRetries;
        
        if (canRetryStaleJob) {
          // Reset to queued for another attempt
          job.status = 'queued';
          job.workerInstanceId = null;
          job.retryCount += 1;
          // Clear any previous error state since we're retrying
          job.error = null;
          job.errorStack = null;
          job.failedStage = null;
          await job.save();

          await Lecture.findByIdAndUpdate(job.lectureId, {
            processingStatus: 'pending',
            processingError: null
          });

          if (bullMQAvailable && bullMQService?.createProcessingJob) {
            try {
              const { removeJob, QUEUE_NAMES } = await import('./bullmq/queues.js');
              const bullJobId = `pipeline-${job.lectureId}`;
              await removeJob(QUEUE_NAMES.PIPELINE, bullJobId);
              await bullMQService.createProcessingJob({
                lectureId: job.lectureId.toString(),
                ownerId: job.ownerId.toString(),
                classId: job.classId.toString(),
                metadata: job.metadata || {}
              }, { priority: 2, force: true });
              console.log(`[BullMQ] Re-queued stale job for lecture ${job.lectureId}`);
            } catch (bullMQError) {
              console.warn(`[BullMQ] Could not re-queue stale job ${job.lectureId}:`, bullMQError.message);
            }
          }

          resetCount++;
          console.log(`Reset stale job ${job._id} to queued (retry ${job.retryCount}/${job.maxRetries})`);
        } else {
          // Mark as failed if max retries reached
          await job.markAsFailed(new Error('Job stale - worker died or timed out'), job.currentStage);
          await Lecture.findByIdAndUpdate(job.lectureId, {
            processingStatus: 'failed',
            processingError: 'Processing timed out. Please try reprocessing the lecture.'
          });
          console.log(`Marked stale job ${job._id} as failed (max retries reached: ${job.retryCount}/${job.maxRetries})`);
        }
      }

      return resetCount;
    } catch (error) {
      console.error('Error resetting stale jobs:', error);
      return 0;
    }
  }

  /**
   * Re-queue lectures stuck in processingStatus=processing with no active Redis job.
   */
  async recoverOrphanedProcessingLectures() {
    if (!bullMQAvailable) return 0;

    try {
      const stuckLectures = await Lecture.find({ processingStatus: 'processing' })
        .select('_id ownerId classId title audioUrl cloudinaryPublicId')
        .limit(50);

      if (stuckLectures.length === 0) return 0;

      const { getJobState, QUEUE_NAMES } = await import('./bullmq/queues.js');
      let recovered = 0;

      for (const lecture of stuckLectures) {
        const bullJobId = `pipeline-${lecture._id}`;
        const redisState = await getJobState(QUEUE_NAMES.PIPELINE, bullJobId);

        if (redisState === 'active' || redisState === 'waiting' || redisState === 'delayed') {
          continue;
        }

        const mongoJob = await ProcessingJob.findPrimaryByLectureId(lecture._id);
        if (!mongoJob) continue;

        if (mongoJob.status === 'completed') {
          await Lecture.findByIdAndUpdate(lecture._id, { processingStatus: 'completed' });
          continue;
        }

        console.log(
          `[QueueService] Recovering orphan lecture ${lecture._id} (mongo=${mongoJob.status}, redis=${redisState || 'missing'})`
        );

        mongoJob.status = 'queued';
        mongoJob.workerInstanceId = null;
        mongoJob.error = null;
        mongoJob.errorStack = null;
        await mongoJob.save();

        await Lecture.findByIdAndUpdate(lecture._id, {
          processingStatus: 'pending',
          processingError: null
        });

        await bullMQService.createProcessingJob({
          lectureId: lecture._id.toString(),
          ownerId: (lecture.ownerId || mongoJob.ownerId).toString(),
          classId: mongoJob.classId.toString(),
          metadata: {
            ...(mongoJob.metadata || {}),
            title: lecture.title,
            audioUrl: lecture.audioUrl,
            cloudinaryPublicId: lecture.cloudinaryPublicId,
            recovered: true
          }
        }, { priority: 2, force: true });

        recovered++;
      }

      if (recovered > 0) {
        console.log(`[QueueService] Recovered ${recovered} orphaned processing lecture(s)`);
      }
      return recovered;
    } catch (error) {
      console.warn('[QueueService] Orphan recovery failed:', error.message);
      return 0;
    }
  }

  /**
   * Get queue statistics (combined MongoDB and BullMQ)
   */
  async getQueueStats() {
    try {
      const mongoStats = await ProcessingJob.getQueueStats();
      
      // Add BullMQ stats if available
      if (bullMQAvailable && bullMQService?.getAllQueueStats) {
        try {
          const bullMQStats = await bullMQService.getAllQueueStats();
          return {
            ...mongoStats,
            distributed: true,
            bullmq: bullMQStats
          };
        } catch (bullMQError) {
          console.warn('[BullMQ] Failed to get stats:', bullMQError.message);
        }
      }
      
      return {
        ...mongoStats,
        distributed: bullMQAvailable
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
        distributed: false
      };
    }
  }

  /**
   * Start periodic health check
   */
  startHealthCheck() {
    // Check for stale jobs every 2 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.resetStaleJobs(); // Provider-aware threshold (see resetStaleJobs)
      } catch (error) {
        console.error('Health check error:', error);
      }
    }, 2 * 60 * 1000);

    console.log('Queue health check started (checking every 2 minutes)');
  }

  /**
   * Stop health check
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('Queue health check stopped');
    }
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    console.log('Shutting down Queue Service...');
    this.stopHealthCheck();
    this.removeAllListeners();
    this.isInitialized = false;
    console.log('Queue Service shut down');
  }
}

// Export singleton instance
const queueService = new QueueService();
export default queueService;