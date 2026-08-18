/**
 * BullMQ Queue Configuration
 * ==========================
 * 
 * Centralized queue definitions for the AI processing pipeline
 * Handles: Transcription → Notes → Study Guide → Quiz → Flashcards
 * 
 * Features:
 * - Multiple queues for different processing stages
 * - Job priorities and rate limiting
 * - Retry policies with exponential backoff
 * - Real-time progress tracking via QueueEvents
 */

import { Queue, QueueEvents, FlowProducer } from 'bullmq';
import { getRedisOptions } from '../../config/redis.js';

// Queue names for the processing pipeline
export const QUEUE_NAMES = {
  TRANSCRIPTION: 'transcription',
  NOTES: 'notes',
  QUIZ: 'quiz',
  FLASHCARDS: 'flashcards',
  // Orchestrator queue for managing the full pipeline
  PIPELINE: 'ai-pipeline'
};

// Default job options for all queues
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000 // 5 seconds initial delay, then 10s, 20s...
  },
  removeOnComplete: {
    count: 100, // Keep last 100 completed jobs
    age: 24 * 3600 // Keep for 24 hours
  },
  removeOnFail: {
    count: 200, // Keep last 200 failed jobs for debugging
    age: 7 * 24 * 3600 // Keep for 7 days
  }
};

// Specific options for each queue
const QUEUE_SPECIFIC_OPTIONS = {
  [QUEUE_NAMES.TRANSCRIPTION]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 3,
    // Transcription can take a long time, set longer timeouts
    backoff: {
      type: 'exponential',
      delay: 10000 // 10 seconds
    }
  },
  [QUEUE_NAMES.NOTES]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 3
  },
  [QUEUE_NAMES.QUIZ]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 3
  },
  [QUEUE_NAMES.FLASHCARDS]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 3
  },
  [QUEUE_NAMES.PIPELINE]: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 2
  }
};

// Store queue instances
const queues = new Map();
const queueEvents = new Map();
let flowProducer = null;

/**
 * Get or create a queue instance
 */
export function getQueue(queueName) {
  if (!queues.has(queueName)) {
    const queue = new Queue(queueName, {
      connection: getRedisOptions(),
      defaultJobOptions: QUEUE_SPECIFIC_OPTIONS[queueName] || DEFAULT_JOB_OPTIONS
    });

    queue.on('error', (err) => {
      console.error(`[Queue:${queueName}] Error:`, err.message);
    });

    queues.set(queueName, queue);
    console.log(`[Queue:${queueName}] Queue created`);
  }

  return queues.get(queueName);
}

/**
 * Get or create QueueEvents for real-time job monitoring
 */
export function getQueueEvents(queueName) {
  if (!queueEvents.has(queueName)) {
    const events = new QueueEvents(queueName, {
      connection: getRedisOptions()
    });

    events.on('error', (err) => {
      console.error(`[QueueEvents:${queueName}] Error:`, err.message);
    });

    queueEvents.set(queueName, events);
    console.log(`[QueueEvents:${queueName}] QueueEvents created`);
  }

  return queueEvents.get(queueName);
}

/**
 * Get or create FlowProducer for job dependencies
 */
export function getFlowProducer() {
  if (!flowProducer) {
    flowProducer = new FlowProducer({
      connection: getRedisOptions()
    });
    console.log('[FlowProducer] FlowProducer created');
  }
  return flowProducer;
}

/**
 * Initialize all queues and events
 */
export async function initializeQueues() {
  console.log('[BullMQ] Initializing queues...');

  // Create all queues
  Object.values(QUEUE_NAMES).forEach(queueName => {
    getQueue(queueName);
    getQueueEvents(queueName);
  });

  // Initialize flow producer
  getFlowProducer();

  console.log('[BullMQ] All queues initialized');
}

/**
 * Add a job to the pipeline queue
 * This starts the full processing pipeline: Transcription → Notes → Study Guide → Quiz → Flashcards
 */
export async function addPipelineJob(jobData, options = {}) {
  const pipelineQueue = getQueue(QUEUE_NAMES.PIPELINE);
  const jobId = `pipeline-${jobData.lectureId}`;

  // BullMQ dedupes on jobId: an existing job blocks re-queue with the same id.
  const existing = await pipelineQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === 'completed' || state === 'failed') {
      await existing.remove();
      console.log(`[Pipeline] Removed terminal Redis job ${jobId} (${state}) before re-queue`);
    } else if (options.force === true) {
      // Stale recovery / explicit retry: remove stuck waiting/active job so we can re-queue.
      await existing.remove();
      console.log(`[Pipeline] Removed in-flight Redis job ${jobId} (${state}) for forced re-queue`);
    } else if (state === 'waiting' || state === 'delayed' || state === 'active') {
      console.log(`[Pipeline] Job ${jobId} already ${state} in Redis — skipping duplicate add`);
      return existing;
    }
  }

  const job = await pipelineQueue.add('process-lecture', jobData, {
    priority: options.priority || 0,
    jobId,
    ...options
  });

  console.log(`[Pipeline] Added job ${job.id} for lecture ${jobData.lectureId}`);
  return job;
}

/**
 * Add a transcription job
 */
export async function addTranscriptionJob(jobData, options = {}) {
  const queue = getQueue(QUEUE_NAMES.TRANSCRIPTION);

  const job = await queue.add('transcribe', jobData, {
    priority: options.priority || 0,
    ...options
  });

  console.log(`[Transcription] Added job ${job.id} for lecture ${jobData.lectureId}`);
  return job;
}

/**
 * Add a notes generation job
 */
export async function addNotesJob(jobData, options = {}) {
  const queue = getQueue(QUEUE_NAMES.NOTES);

  const job = await queue.add('generate-notes', jobData, {
    priority: options.priority || 0,
    ...options
  });

  console.log(`[Notes] Added job ${job.id} for lecture ${jobData.lectureId}`);
  return job;
}

/**
 * Add a quiz generation job
 */
export async function addQuizJob(jobData, options = {}) {
  const queue = getQueue(QUEUE_NAMES.QUIZ);

  const job = await queue.add('generate-quiz', jobData, {
    priority: options.priority || 0,
    ...options
  });

  console.log(`[Quiz] Added job ${job.id} for lecture ${jobData.lectureId}`);
  return job;
}

/**
 * Add a flashcards generation job
 */
export async function addFlashcardsJob(jobData, options = {}) {
  const queue = getQueue(QUEUE_NAMES.FLASHCARDS);

  const job = await queue.add('generate-flashcards', jobData, {
    priority: options.priority || 0,
    ...options
  });

  console.log(`[Flashcards] Added job ${job.id} for lecture ${jobData.lectureId}`);
  return job;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName) {
  const queue = getQueue(queueName);
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats() {
  const stats = {};
  
  for (const queueName of Object.values(QUEUE_NAMES)) {
    stats[queueName] = await getQueueStats(queueName);
  }
  
  return stats;
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName) {
  const queue = getQueue(queueName);
  await queue.pause();
  console.log(`[Queue:${queueName}] Paused`);
}

/**
 * Resume a queue
 */
export async function resumeQueue(queueName) {
  const queue = getQueue(queueName);
  await queue.resume();
  console.log(`[Queue:${queueName}] Resumed`);
}

/**
 * Get job by ID from a specific queue
 */
export async function getJob(queueName, jobId) {
  const queue = getQueue(queueName);
  return await queue.getJob(jobId);
}

/**
 * Get job state
 */
export async function getJobState(queueName, jobId) {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);
  if (!job) return null;
  return await job.getState();
}

/**
 * Retry a failed job
 */
export async function retryJob(queueName, jobId) {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);
  
  if (!job) {
    throw new Error(`Job ${jobId} not found in queue ${queueName}`);
  }
  
  const state = await job.getState();
  if (state !== 'failed') {
    throw new Error(`Job ${jobId} is not in failed state (current: ${state})`);
  }
  
  await job.retry();
  console.log(`[Queue:${queueName}] Retried job ${jobId}`);
}

/**
 * Remove a job
 */
export async function removeJob(queueName, jobId) {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);
  
  if (job) {
    await job.remove();
    console.log(`[Queue:${queueName}] Removed job ${jobId}`);
  }
}

/**
 * Clean up completed/failed jobs
 */
export async function cleanQueue(queueName, grace = 1000, limit = 100, status = 'completed') {
  const queue = getQueue(queueName);
  const removed = await queue.clean(grace, limit, status);
  console.log(`[Queue:${queueName}] Cleaned ${removed.length} ${status} jobs`);
  return removed.length;
}

/**
 * Close all queues and connections (for graceful shutdown)
 */
export async function closeAllQueues() {
  console.log('[BullMQ] Closing all queues...');

  // Close queues
  for (const [name, queue] of queues) {
    await queue.close();
    console.log(`[Queue:${name}] Closed`);
  }
  queues.clear();

  // Close queue events
  for (const [name, events] of queueEvents) {
    await events.close();
    console.log(`[QueueEvents:${name}] Closed`);
  }
  queueEvents.clear();

  // Close flow producer
  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
    console.log('[FlowProducer] Closed');
  }

  console.log('[BullMQ] All queues closed');
}

export default {
  QUEUE_NAMES,
  getQueue,
  getQueueEvents,
  getFlowProducer,
  initializeQueues,
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
  closeAllQueues
};

