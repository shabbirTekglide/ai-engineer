/**
 * Processing Job Model
 * ====================
 * 
 * Database-backed queue for handling long-running AI processing tasks
 * Provides resilience against server restarts, user logout, and connectivity issues
 * 
 * Features:
 * - Persistent queue storage in MongoDB
 * - Progress tracking per stage
 * - Retry logic for failed jobs
 * - Support for multiple concurrent uploads per user
 * - No timeout for long-running processes (3+ hour audio)
 */

import mongoose from "mongoose";

// Stage progress schema to track individual processing steps
const StageProgressSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ['upload', 'transcription', 'notes', 'studyGuide', 'quiz', 'flashcards'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed', 'skipped'],
    default: 'pending'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  startedAt: Date,
  completedAt: Date,
  error: String,
  details: mongoose.Schema.Types.Mixed // Store additional stage-specific data
}, { _id: false });

// Main Processing Job Schema
const ProcessingJobSchema = new mongoose.Schema({
  // Job identification
  lectureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true,
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },

  // Job status
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'queued',
    index: true
  },

  // Priority (higher numbers processed first)
  priority: {
    type: Number,
    default: 0,
    index: true
  },

  // Progress tracking
  overallProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  currentStage: {
    type: String,
    enum: ['upload', 'transcription', 'notes', 'studyGuide', 'quiz', 'flashcards', 'completed'],
    default: 'upload'
  },
  stages: [StageProgressSchema],

  // Time tracking
  queuedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  startedAt: Date,
  completedAt: Date,
  estimatedCompletionTime: Date,

  // Retry logic
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  lastRetryAt: Date,

  // Error handling
  error: String,
  errorStack: String,
  failedStage: String,

  // Processing metadata
  metadata: {
    audioFileSize: Number,
    audioDuration: Number,
    audioFormat: String,
    processingStartTime: Number,
    estimatedDurationMs: Number
  },

  // Worker information
  workerInstanceId: String, // Track which worker is processing this job
  heartbeatAt: Date, // Last heartbeat from worker (detect stale jobs)

}, {
  timestamps: true
});

// Indexes for efficient queries
ProcessingJobSchema.index({ status: 1, priority: -1, queuedAt: 1 }); // Get next jobs to process
ProcessingJobSchema.index({ ownerId: 1, status: 1, createdAt: -1 }); // User's jobs
ProcessingJobSchema.index({ lectureId: 1 }); // Lookup by lecture
ProcessingJobSchema.index({ workerInstanceId: 1, heartbeatAt: 1 }); // Detect stale jobs

// Methods
ProcessingJobSchema.methods.updateStage = async function (stageName, updates) {
  const stageIndex = this.stages.findIndex(s => s.name === stageName);
  if (stageIndex === -1) {
    throw new Error(`Stage ${stageName} not found`);
  }

  Object.assign(this.stages[stageIndex], updates);

  // Update current stage if this stage is now in progress
  if (updates.status === 'in_progress') {
    this.currentStage = stageName;
  }

  // Calculate overall progress
  this.overallProgress = this.calculateOverallProgress();

  await this.save();
};

ProcessingJobSchema.methods.calculateOverallProgress = function () {
  if (this.stages.length === 0) return 0;

  const stageWeights = {
    upload: 5,
    transcription: 50,
    notes: 20,
    studyGuide: 10,
    quiz: 15,
    flashcards: 10
  };

  let totalWeight = 0;
  let completedWeight = 0;

  for (const stage of this.stages) {
    const weight = stageWeights[stage.name] || 10;
    totalWeight += weight;

    if (stage.status === 'completed') {
      completedWeight += weight;
    } else if (stage.status === 'in_progress') {
      completedWeight += (weight * stage.progress / 100);
    }
  }

  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
};

ProcessingJobSchema.methods.markAsProcessing = async function (workerInstanceId) {
  this.status = 'processing';
  this.startedAt = new Date();
  this.workerInstanceId = workerInstanceId;
  this.heartbeatAt = new Date();
  await this.save();
};

ProcessingJobSchema.methods.updateHeartbeat = async function () {
  this.heartbeatAt = new Date();
  await this.save();
};

ProcessingJobSchema.methods.markAsCompleted = async function () {
  this.status = 'completed';
  this.completedAt = new Date();
  this.overallProgress = 100;
  this.currentStage = 'completed';

  // Clear any error fields from previous failed states
  // This ensures completed jobs don't have stale error data
  this.error = null;
  this.errorStack = null;
  this.failedStage = null;

  // Clear stage-level errors for completed stages
  for (const stage of this.stages) {
    if (stage.status === 'completed') {
      stage.error = null;
    }
  }

  await this.save();
};

ProcessingJobSchema.methods.markAsFailed = async function (error, failedStage = null) {
  this.status = 'failed';
  this.error = error.message || String(error);
  this.errorStack = error.stack;
  this.failedStage = failedStage || this.currentStage;
  this.completedAt = new Date();
  await this.save();
};

ProcessingJobSchema.methods.canRetry = function () {
  return this.status === 'failed' && this.retryCount < this.maxRetries;
};

ProcessingJobSchema.methods.retry = async function () {
  if (!this.canRetry()) {
    throw new Error('Job cannot be retried');
  }

  this.status = 'queued';
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  this.error = null;
  this.errorStack = null;
  this.workerInstanceId = null;

  // Reset failed stage and subsequent stages
  const failedStageIndex = this.stages.findIndex(s => s.name === this.failedStage);
  if (failedStageIndex !== -1) {
    for (let i = failedStageIndex; i < this.stages.length; i++) {
      this.stages[i].status = 'pending';
      this.stages[i].progress = 0;
      this.stages[i].error = null;
    }
  }

  await this.save();
};

/**
 * Reset job for full pipeline re-run (e.g. user "Reprocess" on completed or exhausted failed lecture).
 * Keeps upload stage completed; clears downstream stages and queue state.
 */
ProcessingJobSchema.methods.resetForFullReprocess = async function (metadataPatch = {}) {
  this.status = 'queued';
  this.retryCount = 0;
  this.lastRetryAt = undefined;
  this.error = null;
  this.errorStack = null;
  this.failedStage = null;
  this.workerInstanceId = null;
  this.heartbeatAt = null;
  this.startedAt = null;
  this.completedAt = null;
  this.queuedAt = new Date();
  this.overallProgress = 5;
  this.currentStage = 'transcription';

  const prevMeta = this.metadata && typeof this.metadata === 'object' ? { ...this.metadata } : {};
  const patch = metadataPatch && typeof metadataPatch === 'object' ? metadataPatch : {};
  this.metadata = { ...prevMeta, ...patch };

  for (const stage of this.stages) {
    if (stage.name === 'upload') {
      stage.status = 'completed';
      stage.progress = 100;
      stage.error = null;
    } else {
      stage.status = 'pending';
      stage.progress = 0;
      stage.startedAt = undefined;
      stage.completedAt = undefined;
      stage.error = null;
    }
  }

  await this.save();
};

/** Prefer active queue job, else most recently updated row (one lecture should have one job). */
ProcessingJobSchema.statics.findPrimaryByLectureId = async function (lectureId) {
  const active = await this.findOne({
    lectureId,
    status: { $in: ['queued', 'processing'] }
  })
    .sort({ queuedAt: -1 })
    .exec();
  if (active) return active;
  return await this.findOne({ lectureId }).sort({ updatedAt: -1 }).exec();
};

// Static methods
ProcessingJobSchema.statics.getNextJob = async function () {
  // Find the highest priority job that is queued
  return await this.findOne({
    status: 'queued'
  })
    .sort({ priority: -1, queuedAt: 1 })
    .exec();
};

ProcessingJobSchema.statics.findStaleJobs = async function (staleThresholdMinutes = 5) {
  const staleTime = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

  return await this.find({
    status: 'processing',
    heartbeatAt: { $lt: staleTime }
  }).exec();
};

ProcessingJobSchema.statics.getUserJobs = async function (ownerId, options = {}) {
  const query = { ownerId };

  if (options.status) {
    query.status = options.status;
  }

  return await this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .populate('lectureId', 'title recordedAt')
    .populate('classId', 'name code')
    .exec();
};

ProcessingJobSchema.statics.createJob = async function (lectureId, ownerId, classId, metadata = {}) {
  // Initialize stages
  const stages = [
    { name: 'upload', status: 'completed', progress: 100, completedAt: new Date() },
    { name: 'transcription', status: 'pending', progress: 0 },
    { name: 'notes', status: 'pending', progress: 0 },
    { name: 'studyGuide', status: 'pending', progress: 0 },
    { name: 'quiz', status: 'pending', progress: 0 },
    { name: 'flashcards', status: 'pending', progress: 0 }
  ];

  const job = new this({
    lectureId,
    ownerId,
    classId,
    status: 'queued',
    stages,
    currentStage: 'transcription',
    metadata,
    overallProgress: 5 // Upload is complete
  });

  await job.save();
  return job;
};

ProcessingJobSchema.statics.getQueueStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0
  };

  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });

  return result;
};

export default mongoose.model("ProcessingJob", ProcessingJobSchema);

