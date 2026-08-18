/**
 * Queue Worker
 * ============
 * 
 * Background worker for processing audio transcription jobs
 * Runs continuously, picking up jobs from the queue and processing them
 * 
 * Features:
 * - Processes jobs from the database-backed queue
 * - Handles long-running processes without timeout
 * - Resilient to crashes and restarts
 * - Progress tracking and heartbeat monitoring
 * - Graceful shutdown support
 */

import crypto from 'crypto';
import queueService from './queueService.js';
import ProcessingJob from '../models/processingJob.js';
import Lecture from '../models/lecture.js';
import EnhancedTranscriptionProcessor from './enhancedTranscriptionProcessor.js';

class QueueWorker {
  constructor(options = {}) {
    this.workerId = options.workerId || this.generateWorkerId();
    this.isRunning = false;
    this.isProcessing = false;
    this.currentJobId = null;
    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
    this.maxConcurrentJobs = options.maxConcurrentJobs || 1;
    this.pollTimer = null;
    this.heartbeatTimer = null;
    
    // Transcription processor
    this.processor = new EnhancedTranscriptionProcessor({
      openaiApiKey: process.env.OPENAI_API_KEY,
      mistralApiKey: process.env.MISTRAL_API_KEY,
      velmaApiKey: process.env.VELMA_API_KEY
    });

    console.log(`Queue Worker initialized with ID: ${this.workerId}`);
  }

  /**
   * Generate unique worker ID
   */
  generateWorkerId() {
    return `worker-${crypto.randomBytes(8).toString('hex')}-${process.pid}`;
  }

  /**
   * Start the worker
   */
  async start() {
    if (this.isRunning) {
      console.log('Worker is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Worker ${this.workerId} starting...`);

    // Listen to queue events
    this.setupEventListeners();

    // Start processing loop
    this.startProcessingLoop();

    console.log(`Worker ${this.workerId} started successfully`);
  }

  /**
   * Stop the worker
   */
  async stop() {
    console.log(`Worker ${this.workerId} stopping...`);
    this.isRunning = false;

    // Stop polling
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Wait for current job to finish if processing
    if (this.isProcessing && this.currentJobId) {
      console.log(`Waiting for current job ${this.currentJobId} to finish...`);
      // In production, you might want to implement a timeout here
      while (this.isProcessing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Remove event listeners
    queueService.removeAllListeners();

    console.log(`Worker ${this.workerId} stopped`);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for new jobs
    queueService.on('job:created', () => {
      if (!this.isProcessing) {
        this.processNextJob();
      }
    });

    // Listen for job retries
    queueService.on('job:retried', () => {
      if (!this.isProcessing) {
        this.processNextJob();
      }
    });
  }

  /**
   * Start processing loop
   */
  startProcessingLoop() {
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        // If not currently processing, check for jobs
        if (!this.isProcessing) {
          await this.processNextJob();
        }
      } catch (error) {
        console.error('Error in processing loop:', error);
      }

      // Schedule next poll
      if (this.isRunning) {
        this.pollTimer = setTimeout(poll, this.pollInterval);
      }
    };

    // Start polling
    poll();
  }

  /**
   * Process next job in queue
   */
  async processNextJob() {
    if (!this.isRunning || this.isProcessing) {
      return;
    }

    try {
      // Get next job
      const job = await queueService.getNextJob();
      
      if (!job) {
        // No jobs in queue
        return;
      }

      this.isProcessing = true;
      this.currentJobId = job._id;

      console.log(`\n========================================`);
      console.log(`Worker ${this.workerId} picked up job: ${job._id}`);
      console.log(`Lecture ID: ${job.lectureId}`);
      console.log(`========================================\n`);

      // Mark job as processing
      await job.markAsProcessing(this.workerId);

      // Update lecture status
      await Lecture.findByIdAndUpdate(job.lectureId, {
        processingStatus: 'processing'
      });

      // Start heartbeat
      this.startHeartbeat(job._id);

      // Process the job
      await this.processJob(job);

    } catch (error) {
      console.error('Error processing next job:', error);
      if (this.currentJobId) {
        await queueService.failJob(this.currentJobId, error).catch(err => {
          console.error('Error failing job:', err);
        });
      }
    } finally {
      this.stopHeartbeat();
      this.isProcessing = false;
      this.currentJobId = null;
    }
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    try {
      console.log(`Processing job ${job._id} for lecture ${job.lectureId}`);

      // Get lecture data
      const lecture = await Lecture.findById(job.lectureId);
      if (!lecture) {
        throw new Error('Lecture not found');
      }

      // Process with enhanced transcription processor
      await this.processor.processTranscription(job.lectureId.toString(), {
        userId: job.ownerId,
        onProgress: async (progressData) => {
          try {
            // Map stage names to our queue stages
            const stageMap = {
              'transcription': 'transcription',
              'notes': 'notes',
              'quiz': 'quiz',
              'flashcards': 'flashcards'
            };

            const queueStage = stageMap[progressData.stage];
            if (!queueStage) return;

            // Update job progress
            await queueService.updateJobProgress(
              job._id,
              queueStage,
              progressData.progress || 0,
              progressData.details || {}
            );

            console.log(`Job ${job._id} - Stage: ${queueStage}, Progress: ${progressData.progress}%`);
          } catch (error) {
            console.error('Error updating progress:', error);
          }
        }
      });

      // Re-fetch the job to check current state (may have been modified by stale checker)
      const currentJob = await ProcessingJob.findById(job._id);
      if (!currentJob) {
        console.warn(`Job ${job._id} no longer exists, skipping completion`);
        return;
      }

      // If job was reset by stale checker (status = queued) while we were processing,
      // we should still complete it since the work is done
      if (currentJob.status === 'queued') {
        console.log(`Job ${job._id} was reset to queued while processing, reclaiming...`);
        await currentJob.markAsProcessing(this.workerId);
      }

      // Mark all stages as completed
      await queueService.completeJobStage(job._id, 'transcription');
      await queueService.completeJobStage(job._id, 'notes');
      await queueService.completeJobStage(job._id, 'quiz');
      await queueService.completeJobStage(job._id, 'flashcards');

      // Mark job as completed
      await queueService.completeJob(job._id);

      console.log(`\n========================================`);
      console.log(`Job ${job._id} completed successfully!`);
      console.log(`========================================\n`);

    } catch (error) {
      console.error(`Job ${job._id} processing error:`, error);

      // Determine which stage failed
      const failedStage = job.currentStage;

      // Mark stage as failed
      await queueService.failJobStage(job._id, failedStage, error);

      // Mark job as failed
      await queueService.failJob(job._id, error, failedStage);

      throw error;
    }
  }

  /**
   * Start sending heartbeats for current job
   */
  startHeartbeat(jobId) {
    this.stopHeartbeat(); // Clear any existing heartbeat

    this.heartbeatTimer = setInterval(async () => {
      try {
        const job = await ProcessingJob.findById(jobId);
        if (job && job.status === 'processing') {
          await job.updateHeartbeat();
          console.log(`Heartbeat sent for job ${jobId}`);
        }
      } catch (error) {
        console.error('Error sending heartbeat:', error);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop sending heartbeats
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      currentJobId: this.currentJobId,
      uptime: process.uptime()
    };
  }
}

// Singleton instance
let workerInstance = null;

/**
 * Initialize and start the queue worker
 */
export async function startWorker(options = {}) {
  if (workerInstance) {
    console.log('Worker already running');
    return workerInstance;
  }

  // Initialize queue service first
  await queueService.initialize();

  // Create and start worker
  workerInstance = new QueueWorker(options);
  await workerInstance.start();

  return workerInstance;
}

/**
 * Stop the queue worker
 */
export async function stopWorker() {
  if (!workerInstance) {
    console.log('No worker running');
    return;
  }

  await workerInstance.stop();
  workerInstance = null;
}

/**
 * Get worker instance
 */
export function getWorkerInstance() {
  return workerInstance;
}

/**
 * Get worker status
 */
export function getWorkerStatus() {
  if (!workerInstance) {
    return { isRunning: false };
  }
  return workerInstance.getStatus();
}

export default QueueWorker;

