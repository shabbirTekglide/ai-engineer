/**
 * BullMQ Workers
 * ===============
 * 
 * Dedicated workers for each stage of the AI processing pipeline
 * Handles: Transcription → Notes → Study Guide → Quiz → Flashcards
 * 
 * Features:
 * - Concurrent processing for high throughput
 * - Progress tracking and job events
 * - Automatic retries with backoff
 * - Graceful shutdown support
 * - Rate limiting to protect API quotas
 */

import { Worker } from 'bullmq';
import { getRedisOptions } from '../../config/redis.js';
import { QUEUE_NAMES } from './queues.js';
import EnhancedTranscriptionProcessor from '../enhancedTranscriptionProcessor.js';
import { recordTranscriptionUsage } from '../usageService.js';
import Lecture from '../../models/lecture.js';
import ProcessingJob from '../../models/processingJob.js';
import User from '../../models/User.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');

// Store worker instances
const workers = new Map();

/**
 * Worker Configuration
 * Adjust concurrency based on your server resources and API rate limits
 * 
 * Environment variables:
 * - WORKER_TRANSCRIPTION_CONCURRENCY (default: 3)
 * - WORKER_NOTES_CONCURRENCY (default: 5)
 * - WORKER_QUIZ_CONCURRENCY (default: 5)
 * - WORKER_FLASHCARDS_CONCURRENCY (default: 5)
 * - WORKER_PIPELINE_CONCURRENCY (default: 10)
 * - WORKER_TRANSCRIPTION_RATE_LIMIT (default: 5 per minute)
 * - WORKER_NOTES_RATE_LIMIT (default: 30 per minute)
 * - WORKER_QUIZ_RATE_LIMIT (default: 30 per minute)
 * - WORKER_FLASHCARDS_RATE_LIMIT (default: 30 per minute)
 */
const WORKER_CONFIG = {
  [QUEUE_NAMES.TRANSCRIPTION]: {
    // Process multiple transcriptions simultaneously
    // Limited by API rate limits (Whisper/Mistral)
    concurrency: parseInt(process.env.WORKER_TRANSCRIPTION_CONCURRENCY, 10) || 3,
    limiter: {
      max: parseInt(process.env.WORKER_TRANSCRIPTION_RATE_LIMIT, 10) || 5, // Max jobs
      duration: 60000 // per minute (for API rate limiting)
    }
  },
  [QUEUE_NAMES.NOTES]: {
    // Notes generation is lighter on API
    concurrency: parseInt(process.env.WORKER_NOTES_CONCURRENCY, 10) || 5,
    limiter: {
      max: parseInt(process.env.WORKER_NOTES_RATE_LIMIT, 10) || 30,
      duration: 60000
    }
  },
  [QUEUE_NAMES.QUIZ]: {
    concurrency: parseInt(process.env.WORKER_QUIZ_CONCURRENCY, 10) || 5,
    limiter: {
      max: parseInt(process.env.WORKER_QUIZ_RATE_LIMIT, 10) || 30,
      duration: 60000
    }
  },
  [QUEUE_NAMES.FLASHCARDS]: {
    concurrency: parseInt(process.env.WORKER_FLASHCARDS_CONCURRENCY, 10) || 5,
    limiter: {
      max: parseInt(process.env.WORKER_FLASHCARDS_RATE_LIMIT, 10) || 30,
      duration: 60000
    }
  },
  [QUEUE_NAMES.PIPELINE]: {
    // Velma transcription is slow and rate-limited; avoid running many pipelines at once.
    concurrency: (() => {
      const env = parseInt(process.env.WORKER_PIPELINE_CONCURRENCY, 10);
      if (!Number.isNaN(env) && env > 0) return env;
      const provider = process.env.ACTIVE_TRANSCRIPTION_PROVIDER || 'mistral';
      return provider === 'velma' ? 2 : 10;
    })()
  }
};

/**
 * Download file from URL with progress logging, timeout, redirect following,
 * and idempotent caching so retried jobs reuse an already-downloaded file.
 *
 * Why this matters: the previous bare implementation sat silently for 5+
 * minutes while pulling ~35 MB from S3, with no timeout, no progress, and no
 * redirect handling. That made it hard to tell whether the worker was stuck.
 */
async function downloadFile(url, outputPath, options = {}) {
  const {
    timeoutMs = parseInt(process.env.DOWNLOAD_TIMEOUT_MS, 10) || 10 * 60 * 1000, // 10 min default
    maxRedirects = 5,
    reuseExisting = true,
    progressLogIntervalMs = 5000
  } = options;

  // Idempotent cache: if a non-empty temp file already exists at outputPath,
  // assume a previous attempt finished the download and reuse it. This keeps
  // BullMQ retries (and the parallel Mongo worker) from re-downloading the
  // same multi-MB audio file.
  if (reuseExisting) {
    try {
      const stat = await fs.stat(outputPath);
      if (stat.size > 0) {
        console.log(
          `[Download] Reusing cached audio at ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`
        );
        return outputPath;
      }
    } catch (_) {
      // file does not exist – proceed with download
    }
  }

  const startedAt = Date.now();

  const doGet = (currentUrl, redirectsLeft) =>
    new Promise((resolve, reject) => {
      const protocol = currentUrl.startsWith('https') ? https : http;
      console.log(`[Download] Starting download: ${currentUrl}`);

      const file = createWriteStream(outputPath);
      let received = 0;
      let total = 0;
      let lastLog = Date.now();
      let timer = null;

      const cleanupAndReject = (err) => {
        if (timer) clearTimeout(timer);
        try { file.close(); } catch (_) { /* noop */ }
        fs.unlink(outputPath).catch(() => { });
        reject(err);
      };

      const req = protocol.get(currentUrl, (response) => {
        const status = response.statusCode || 0;

        // Follow redirects
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          try { file.close(); } catch (_) { /* noop */ }
          if (redirectsLeft <= 0) {
            return reject(new Error(`Too many redirects while downloading ${url}`));
          }
          const nextUrl = new URL(response.headers.location, currentUrl).toString();
          console.log(`[Download] Following ${status} redirect → ${nextUrl}`);
          return doGet(nextUrl, redirectsLeft - 1).then(resolve, reject);
        }

        if (status !== 200) {
          return cleanupAndReject(
            new Error(`Failed to download: HTTP ${status} from ${currentUrl}`)
          );
        }

        total = parseInt(response.headers['content-length'], 10) || 0;
        if (total > 0) {
          console.log(`[Download] Content-Length: ${(total / 1024 / 1024).toFixed(2)} MB`);
        }

        response.on('data', (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastLog >= progressLogIntervalMs) {
            const mb = (received / 1024 / 1024).toFixed(2);
            const elapsedSec = ((now - startedAt) / 1000).toFixed(1);
            const speedKBps = ((received / 1024) / Math.max(0.1, (now - startedAt) / 1000)).toFixed(0);
            if (total > 0) {
              const pct = ((received / total) * 100).toFixed(1);
              console.log(`[Download] ${mb} MB / ${(total / 1024 / 1024).toFixed(2)} MB (${pct}%) - ${speedKBps} KB/s - ${elapsedSec}s`);
            } else {
              console.log(`[Download] ${mb} MB received - ${speedKBps} KB/s - ${elapsedSec}s`);
            }
            lastLog = now;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          if (timer) clearTimeout(timer);
          file.close();
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          console.log(
            `[Download] Completed ${(received / 1024 / 1024).toFixed(2)} MB in ${elapsed}s → ${outputPath}`
          );
          resolve(outputPath);
        });

        file.on('error', cleanupAndReject);
        response.on('error', cleanupAndReject);
      });

      req.on('error', cleanupAndReject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Download timeout after ${Math.round(timeoutMs / 1000)}s: ${currentUrl}`));
      });

      timer = setTimeout(() => {
        req.destroy(new Error(`Download wall-clock timeout after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    });

  return doGet(url, maxRedirects);
}

/**
 * Update job progress in MongoDB ProcessingJob
 */
async function updateProcessingJobProgress(lectureId, stage, progress, status = 'in_progress') {
  try {
    const job = await ProcessingJob.findPrimaryByLectureId(lectureId);
    if (job) {
      await job.updateStage(stage, {
        status,
        progress,
        ...(status === 'in_progress' ? { startedAt: new Date() } : {}),
        ...(status === 'completed' ? { completedAt: new Date() } : {})
      });
      // Keep heartbeat fresh during long Velma/Mistral runs so the stale-job
      // checker does not reset jobs that are still actively processing.
      if (job.status === 'processing') {
        await job.updateHeartbeat();
      }
    }
  } catch (error) {
    console.error(`[Worker] Failed to update processing job progress:`, error.message);
  }
}

/**
 * Periodic heartbeat while a pipeline job runs (Velma chunks can take 30+ min).
 */
function startPipelineHeartbeat(lectureId, intervalMs = 30000) {
  const timer = setInterval(async () => {
    try {
      const job = await ProcessingJob.findPrimaryByLectureId(lectureId);
      if (job?.status === 'processing') {
        await job.updateHeartbeat();
      }
    } catch (error) {
      console.error(`[Worker] Heartbeat failed for lecture ${lectureId}:`, error.message);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

/**
 * Create the Pipeline Orchestrator Worker
 * Coordinates the full processing flow
 */
function createPipelineWorker() {
  const worker = new Worker(
    QUEUE_NAMES.PIPELINE,
    async (job) => {
      const { lectureId, ownerId, classId, metadata } = job.data;
      console.log(`[Pipeline] Starting processing for lecture ${lectureId}`);

      const stopHeartbeat = startPipelineHeartbeat(lectureId);

      try {
        // Early validation: Check API keys BEFORE changing any status
        // This prevents setting lecture to "failed" for configuration issues
        const transcriptionProvider = process.env.ACTIVE_TRANSCRIPTION_PROVIDER || 'mistral';
        if (transcriptionProvider === 'velma' && !process.env.VELMA_API_KEY) {
          console.warn(`[Pipeline] Velma API key not configured, skipping BullMQ processing for lecture ${lectureId}`);
          return {
            success: false,
            lectureId,
            skipped: true,
            reason: 'Velma API key not configured - deferring to MongoDB worker'
          };
        }
        if (transcriptionProvider === 'mistral' && !process.env.MISTRAL_API_KEY) {
          console.warn(`[Pipeline] Mistral API key not configured, skipping BullMQ processing for lecture ${lectureId}`);
          // Don't throw - just return and let MongoDB worker handle it
          return {
            success: false,
            lectureId,
            skipped: true,
            reason: 'Mistral API key not configured - deferring to MongoDB worker'
          };
        }
        if (transcriptionProvider === 'openai' && !process.env.OPENAI_API_KEY) {
          console.warn(`[Pipeline] OpenAI API key not configured, skipping BullMQ processing for lecture ${lectureId}`);
          return {
            success: false,
            lectureId,
            skipped: true,
            reason: 'OpenAI API key not configured - deferring to MongoDB worker'
          };
        }

        // Update lecture status
        await Lecture.findByIdAndUpdate(lectureId, {
          processingStatus: 'processing'
        });

        // Prefer active Mongo job so reprocess does not attach to a stale completed row
        let processingJob = await ProcessingJob.findPrimaryByLectureId(lectureId);
        if (!processingJob) {
          processingJob = await ProcessingJob.createJob(lectureId, ownerId, classId, metadata);
        }
        await processingJob.markAsProcessing(`worker-${job.id}`);

        // Get lecture data
        const lecture = await Lecture.findById(lectureId);
        if (!lecture) {
          throw new Error('Lecture not found');
        }

        if (!lecture.audioUrl && !lecture.localAudioPath && lecture.sourceType !== 'document') {
          throw new Error('Lecture has no audio or document source');
        }

        // Create processor instance
        const processor = new EnhancedTranscriptionProcessor({
          openaiApiKey: process.env.OPENAI_API_KEY,
          mistralApiKey: process.env.MISTRAL_API_KEY,
          velmaApiKey: process.env.VELMA_API_KEY,
          userId: ownerId
        });

        // ============ STAGE 1: TRANSCRIPTION ============
        await job.updateProgress({ stage: 'transcription', progress: 0 });
        await updateProcessingJobProgress(lectureId, 'transcription', 0, 'in_progress');

        // Ensure temp directory exists
        await fs.mkdir(TEMP_DIR, { recursive: true });

        // Download or get audio file
        let extractedText = "";

        if (lecture.sourceType === 'document' || metadata.sourceType === 'document') {
          console.log(`[BullMQ] Processing document lecture ${lectureId}`);
          // Document processing
          const docUrl = metadata.documentUrl || lecture.sourceFile?.url;
          const ext = metadata.extension || lecture.sourceFile?.extension || 'pdf';

          if (!docUrl) throw new Error('Lecture has no document source');

          const tempDocPath = path.join(TEMP_DIR, `${lectureId}.doc.${ext}`);
          await downloadFile(docUrl, tempDocPath);

          const { extractTextFromDocument } = await import('../documentParsingService.js');
          extractedText = await extractTextFromDocument(tempDocPath, ext);

          await Lecture.findByIdAndUpdate(lectureId, {
            $set: {
              transcript: {
                language: 'en', // default or detect later
                wordCount: extractedText.split(/\s+/).length,
                text: extractedText,
                asr: { provider: 'document-parser', model: 'pdf-parse/mammoth' },
                segments: []
              }
            }
          });

          await updateProcessingJobProgress(lectureId, 'transcription', 100, 'completed');
          await job.updateProgress({ stage: 'transcription', progress: 100 });

          await fs.unlink(tempDocPath).catch(() => { });
        } else {
          let tempAudioPath = null;
          if (lecture.audioUrl) {
            tempAudioPath = path.join(TEMP_DIR, `${lectureId}.audio`);
            await downloadFile(lecture.audioUrl, tempAudioPath);
          } else if (lecture.localAudioPath) {
            tempAudioPath = lecture.localAudioPath;
          }

          if (!tempAudioPath) {
            throw new Error('Lecture has no audio source');
          }

          // Initialize transcription service
          const { createMistralTranscriptionService } = await import('../mistralTranscriptionService.js');
          const { createVelmaTranscriptionService } = await import('../velmaTranscriptionService.js');
          const { createTranscriptionService, TranscriptionConfig } = await import('../openaiTranscriptionService.js');

          const provider = processor.transcriptionProvider;
          let transcriptionService;

          if (provider === 'velma') {
            transcriptionService = createVelmaTranscriptionService(process.env.VELMA_API_KEY);
          } else if (provider === 'mistral') {
            transcriptionService = createMistralTranscriptionService(process.env.MISTRAL_API_KEY);
          } else {
            transcriptionService = createTranscriptionService(process.env.OPENAI_API_KEY);
          }

          // Analyze audio
          const audioAnalysis = await transcriptionService.analyzeAudio(tempAudioPath);
          const transcriptionConfig = processor.createTranscriptionConfig(lecture, audioAnalysis);

          // Transcribe
          const transcriptionResult = await transcriptionService.transcribe(tempAudioPath, {
            onProgress: async (progress) => {
              const percent = progress.progress || 0;
              await job.updateProgress({ stage: 'transcription', progress: percent });
              await updateProcessingJobProgress(lectureId, 'transcription', percent);
            }
          });

          extractedText = transcriptionResult.text;

          // Save transcript
          await Lecture.findByIdAndUpdate(lectureId, {
            $set: {
              transcript: {
                language: transcriptionResult.language,
                wordCount: transcriptionResult.wordCount,
                text: transcriptionResult.text,
                asr: {
                  provider: provider === 'velma'
                    ? 'modulate-velma-2'
                    : provider === 'mistral'
                      ? 'mistral-voxtral'
                      : 'openai-whisper',
                  model: transcriptionResult.model,
                  confidence: transcriptionResult.confidence,
                  durationMs: transcriptionResult.processingTime
                },
                segments: transcriptionResult.segments
              }
            }
          });

          // Record transcription usage for billing/analytics.
          try {
            const providerDefaultModel =
              provider === 'velma' ? 'velma-2-stt-batch'
                : provider === 'mistral' ? 'voxtral-mini-latest'
                  : 'whisper-1';
            const modelUsed = transcriptionResult.model || transcriptionConfig.model || providerDefaultModel;
            const audioSeconds = audioAnalysis?.duration || 0;
            await recordTranscriptionUsage({
              userId: ownerId || lecture.ownerId,
              service: 'lecture-transcription',
              model: modelUsed,
              audioSeconds,
              metadata: {
                lectureId,
                provider,
                source: 'bullmq-pipeline'
              }
            });
          } catch (logErr) {
            console.warn('[Pipeline] Transcription usage logging failed:', logErr?.message);
          }

          await updateProcessingJobProgress(lectureId, 'transcription', 100, 'completed');
          await job.updateProgress({ stage: 'transcription', progress: 100 });

          // Cleanup temp file
          if (lecture.audioUrl && tempAudioPath) {
            await fs.unlink(tempAudioPath).catch(() => { });
          }
        }

        // ============ STAGE 2: NOTES ============
        await job.updateProgress({ stage: 'notes', progress: 0 });
        await updateProcessingJobProgress(lectureId, 'notes', 0, 'in_progress');

        const notes = await processor.generateLectureNotes(extractedText);

        await Lecture.findByIdAndUpdate(lectureId, {
          $set: {
            notes: {
              overview: notes.overview,
              keyPoints: notes.keyTakeaways || notes.keyPoints,
              prompts: notes.prompts
            }
          }
        });

        await updateProcessingJobProgress(lectureId, 'notes', 100, 'completed');
        await job.updateProgress({ stage: 'notes', progress: 100 });

        // ============ STAGE 3: STUDY GUIDE ============
        await job.updateProgress({ stage: 'studyGuide', progress: 0 });
        await updateProcessingJobProgress(lectureId, 'studyGuide', 0, 'in_progress');

        const studyGuide = await processor.generateStudyGuide(extractedText);

        // Re-fetch lecture to get updated transcript data (including sourceHash if set)
        const updatedLecture = await Lecture.findById(lectureId).select('transcript.sourceHash');

        await Lecture.findByIdAndUpdate(lectureId, {
          $set: {
            studyGuide: {
              content: studyGuide,
              sourceHash: updatedLecture?.transcript?.sourceHash || null
            }
          }
        });

        await updateProcessingJobProgress(lectureId, 'studyGuide', 100, 'completed');
        await job.updateProgress({ stage: 'studyGuide', progress: 100 });

        // ============ STAGE 4 & 5: QUIZ + FLASHCARDS (parallel) ============
        await job.updateProgress({ stage: 'quiz', progress: 0 });
        await updateProcessingJobProgress(lectureId, 'quiz', 0, 'in_progress');
        await updateProcessingJobProgress(lectureId, 'flashcards', 0, 'in_progress');

        const [quiz, flashcards] = await Promise.all([
          processor.generateQuiz(notes),
          processor.generateFlashcards(notes)
        ]);

        await Lecture.findByIdAndUpdate(lectureId, {
          $set: {
            quiz: {
              title: quiz.title,
              questions: quiz.questions
            },
            flashCards: {
              cards: flashcards.flashcards
            }
          }
        });

        await updateProcessingJobProgress(lectureId, 'quiz', 100, 'completed');
        await updateProcessingJobProgress(lectureId, 'flashcards', 100, 'completed');
        await job.updateProgress({ stage: 'flashcards', progress: 100 });

        // ============ COMPLETE ============
        await Lecture.findByIdAndUpdate(lectureId, {
          processingStatus: 'completed',
          processingError: null
        });

        await processingJob.markAsCompleted();

        console.log(`[Pipeline] Completed processing for lecture ${lectureId}`);

        return {
          success: true,
          lectureId,
          stages: ['transcription', 'notes', 'studyGuide', 'quiz', 'flashcards']
        };

      } catch (error) {
        console.error(`[Pipeline] Processing failed for lecture ${lectureId}:`, error);

        // Check if this is a retriable/configuration error
        // These errors should NOT permanently fail the job - let MongoDB worker retry
        const retriableErrors = [
          'API key not configured',
          'ECONNREFUSED',
          'ECONNRESET',
          'ETIMEDOUT',
          'ENETUNREACH',
          'EAI_AGAIN',
          'rate limit',
          'timeout',
          // Transient transcription provider errors (Velma / Voxtral / Whisper):
          'no valid transcription results', // every chunk failed - usually transient
          'too many concurrent', // Modulate 429 concurrent-limit text
          'too many requests',
          'service unavailable',
          'bad gateway',
          'gateway timeout',
          'failed to download',
          'download timeout',
          'download wall-clock timeout',
          'socket hang up'
        ];

        const isRetriable = retriableErrors.some(pattern =>
          error.message?.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isRetriable) {
          console.log(`[Pipeline] Retriable error for lecture ${lectureId}, not marking as failed`);
          // Don't update lecture status to failed - let MongoDB worker retry
          // Just update the processing job stage error for tracking
          const processingJob = await ProcessingJob.findPrimaryByLectureId(lectureId);
          if (processingJob) {
            const currentStage = job.data.currentStage || processingJob.currentStage;
            await processingJob.updateStage(currentStage, {
              error: error.message
            });
          }
          throw error; // Still throw so BullMQ knows the job failed
        }

        // Permanent failure - update lecture status
        await Lecture.findByIdAndUpdate(lectureId, {
          processingStatus: 'failed',
          processingError: error.message
        });

        // Update processing job
        const processingJob = await ProcessingJob.findPrimaryByLectureId(lectureId);
        if (processingJob) {
          await processingJob.markAsFailed(error, job.data.currentStage);
        }

        // 💰 REFUND: Add durationSec back to user subscription on permanent failure
        try {
          const failedLecture = await Lecture.findById(lectureId).select('durationSec ownerId sourceType');
          const refundAmount = Math.ceil(failedLecture?.durationSec || 0);
          if (refundAmount > 0) {
            const refundUser = await User.findById(failedLecture.ownerId || ownerId);
            if (refundUser) {
              refundUser.subscription.availableSeconds += refundAmount;
              await refundUser.save();
              console.log(`[Pipeline] Refunded ${refundAmount} ${failedLecture.sourceType === 'document' ? 'words' : 'seconds'} to user ${refundUser._id}`);
            }
          }
        } catch (refundErr) {
          console.error('[Pipeline] Failed to refund subscription credits to user:', refundErr.message);
        }

        throw error;
      } finally {
        stopHeartbeat();
      }
    },
    {
      connection: getRedisOptions(),
      ...WORKER_CONFIG[QUEUE_NAMES.PIPELINE]
    }
  );

  setupWorkerEvents(worker, QUEUE_NAMES.PIPELINE);
  return worker;
}

/**
 * Create the Transcription Worker
 * Handles audio transcription separately (for when running stages in parallel)
 */
function createTranscriptionWorker() {
  const worker = new Worker(
    QUEUE_NAMES.TRANSCRIPTION,
    async (job) => {
      const { lectureId, audioUrl, localAudioPath, userId } = job.data;
      console.log(`[Transcription] Processing lecture ${lectureId}`);

      // Early validation: Check API keys BEFORE doing any work
      const transcriptionProvider = process.env.ACTIVE_TRANSCRIPTION_PROVIDER || 'mistral';
      if (transcriptionProvider === 'velma' && !process.env.VELMA_API_KEY) {
        console.warn(`[Transcription] Velma API key not configured, skipping for lecture ${lectureId}`);
        return { success: false, lectureId, skipped: true, reason: 'Velma API key not configured' };
      }
      if (transcriptionProvider === 'mistral' && !process.env.MISTRAL_API_KEY) {
        console.warn(`[Transcription] Mistral API key not configured, skipping for lecture ${lectureId}`);
        return { success: false, lectureId, skipped: true, reason: 'Mistral API key not configured' };
      }
      if (transcriptionProvider === 'openai' && !process.env.OPENAI_API_KEY) {
        console.warn(`[Transcription] OpenAI API key not configured, skipping for lecture ${lectureId}`);
        return { success: false, lectureId, skipped: true, reason: 'OpenAI API key not configured' };
      }

      let tempAudioPath = null;

      try {
        await fs.mkdir(TEMP_DIR, { recursive: true });

        // Download or use local audio
        if (audioUrl) {
          tempAudioPath = path.join(TEMP_DIR, `${lectureId}-${Date.now()}.audio`);
          await downloadFile(audioUrl, tempAudioPath);
        } else if (localAudioPath) {
          tempAudioPath = localAudioPath;
        } else {
          throw new Error('No audio source provided');
        }

        const processor = new EnhancedTranscriptionProcessor({
          openaiApiKey: process.env.OPENAI_API_KEY,
          mistralApiKey: process.env.MISTRAL_API_KEY,
          velmaApiKey: process.env.VELMA_API_KEY,
          userId
        });

        // Get lecture for config
        const lecture = await Lecture.findById(lectureId);
        if (!lecture) throw new Error('Lecture not found');

        // Initialize service
        const provider = processor.transcriptionProvider;
        let transcriptionService;

        if (provider === 'velma') {
          const { createVelmaTranscriptionService } = await import('../velmaTranscriptionService.js');
          transcriptionService = createVelmaTranscriptionService(process.env.VELMA_API_KEY);
        } else if (provider === 'mistral') {
          const { createMistralTranscriptionService } = await import('../mistralTranscriptionService.js');
          transcriptionService = createMistralTranscriptionService(process.env.MISTRAL_API_KEY);
        } else {
          const { createTranscriptionService } = await import('../openaiTranscriptionService.js');
          transcriptionService = createTranscriptionService(process.env.OPENAI_API_KEY);
        }

        // Analyze and transcribe
        const audioAnalysis = await transcriptionService.analyzeAudio(tempAudioPath);

        const result = await transcriptionService.transcribe(tempAudioPath, {
          onProgress: async (progress) => {
            await job.updateProgress(progress.progress || 0);
          }
        });

        // Save to database
        await Lecture.findByIdAndUpdate(lectureId, {
          $set: {
            transcript: {
              language: result.language,
              wordCount: result.wordCount,
              text: result.text,
              asr: {
                provider: provider === 'velma'
                  ? 'modulate-velma-2'
                  : provider === 'mistral'
                    ? 'mistral-voxtral'
                    : 'openai-whisper',
                model: result.model,
                confidence: result.confidence,
                durationMs: result.processingTime
              },
              segments: result.segments
            }
          }
        });

        // Record transcription usage for billing/analytics (BullMQ direct path).
        try {
          const providerDefaultModel =
            provider === 'velma' ? 'velma-2-stt-batch'
              : provider === 'mistral' ? 'voxtral-mini-latest'
                : 'whisper-1';
          const modelUsed = result.model || providerDefaultModel;
          const audioSeconds = audioAnalysis?.duration || 0;
          await recordTranscriptionUsage({
            userId: userId || lecture.ownerId,
            service: 'lecture-transcription',
            model: modelUsed,
            audioSeconds,
            metadata: {
              lectureId,
              provider,
              source: 'bullmq-transcription'
            }
          });
        } catch (logErr) {
          console.warn('[Transcription] Usage logging failed:', logErr?.message);
        }

        console.log(`[Transcription] Completed lecture ${lectureId}`);

        return {
          success: true,
          lectureId,
          transcriptLength: result.text.length,
          wordCount: result.wordCount
        };

      } finally {
        // Cleanup temp file
        if (audioUrl && tempAudioPath) {
          await fs.unlink(tempAudioPath).catch(() => { });
        }
      }
    },
    {
      connection: getRedisOptions(),
      ...WORKER_CONFIG[QUEUE_NAMES.TRANSCRIPTION]
    }
  );

  setupWorkerEvents(worker, QUEUE_NAMES.TRANSCRIPTION);
  return worker;
}

/**
 * Create the Notes Generation Worker
 */
function createNotesWorker() {
  const worker = new Worker(
    QUEUE_NAMES.NOTES,
    async (job) => {
      const { lectureId, transcript, userId } = job.data;
      console.log(`[Notes] Generating notes for lecture ${lectureId}`);

      const processor = new EnhancedTranscriptionProcessor({
        openaiApiKey: process.env.OPENAI_API_KEY,
        userId
      });

      const notes = await processor.generateLectureNotes(transcript);

      await Lecture.findByIdAndUpdate(lectureId, {
        $set: {
          notes: {
            overview: notes.overview,
            keyPoints: notes.keyTakeaways || notes.keyPoints,
            prompts: notes.prompts
          }
        }
      });

      console.log(`[Notes] Completed for lecture ${lectureId}`);

      return {
        success: true,
        lectureId,
        sectionsCount: notes.sections?.length || 0
      };
    },
    {
      connection: getRedisOptions(),
      ...WORKER_CONFIG[QUEUE_NAMES.NOTES]
    }
  );

  setupWorkerEvents(worker, QUEUE_NAMES.NOTES);
  return worker;
}

/**
 * Create the Quiz Generation Worker
 */
function createQuizWorker() {
  const worker = new Worker(
    QUEUE_NAMES.QUIZ,
    async (job) => {
      const { lectureId, notes, userId } = job.data;
      console.log(`[Quiz] Generating quiz for lecture ${lectureId}`);

      const processor = new EnhancedTranscriptionProcessor({
        openaiApiKey: process.env.OPENAI_API_KEY,
        userId
      });

      const quiz = await processor.generateQuiz(notes);

      await Lecture.findByIdAndUpdate(lectureId, {
        $set: {
          quiz: {
            title: quiz.title,
            questions: quiz.questions
          }
        }
      });

      console.log(`[Quiz] Completed for lecture ${lectureId}`);

      return {
        success: true,
        lectureId,
        questionsCount: quiz.questions?.length || 0
      };
    },
    {
      connection: getRedisOptions(),
      ...WORKER_CONFIG[QUEUE_NAMES.QUIZ]
    }
  );

  setupWorkerEvents(worker, QUEUE_NAMES.QUIZ);
  return worker;
}

/**
 * Create the Flashcards Generation Worker
 */
function createFlashcardsWorker() {
  const worker = new Worker(
    QUEUE_NAMES.FLASHCARDS,
    async (job) => {
      const { lectureId, notes, userId } = job.data;
      console.log(`[Flashcards] Generating flashcards for lecture ${lectureId}`);

      const processor = new EnhancedTranscriptionProcessor({
        openaiApiKey: process.env.OPENAI_API_KEY,
        userId
      });

      const flashcards = await processor.generateFlashcards(notes);

      await Lecture.findByIdAndUpdate(lectureId, {
        $set: {
          flashCards: {
            cards: flashcards.flashcards
          }
        }
      });

      console.log(`[Flashcards] Completed for lecture ${lectureId}`);

      return {
        success: true,
        lectureId,
        cardsCount: flashcards.flashcards?.length || 0
      };
    },
    {
      connection: getRedisOptions(),
      ...WORKER_CONFIG[QUEUE_NAMES.FLASHCARDS]
    }
  );

  setupWorkerEvents(worker, QUEUE_NAMES.FLASHCARDS);
  return worker;
}

/**
 * Setup common event handlers for workers
 */
function setupWorkerEvents(worker, queueName) {
  worker.on('completed', (job, result) => {
    console.log(`[${queueName}] Job ${job.id} completed:`, JSON.stringify(result).slice(0, 100));
  });

  worker.on('failed', (job, error) => {
    console.error(`[${queueName}] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[${queueName}] Job ${job.id} progress:`, progress);
  });

  worker.on('error', (error) => {
    console.error(`[${queueName}] Worker error:`, error.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[${queueName}] Job ${jobId} stalled`);
  });
}

/**
 * Initialize all workers
 */
export async function initializeWorkers() {
  console.log('[BullMQ] Initializing workers...');

  // Create all workers
  workers.set(QUEUE_NAMES.PIPELINE, createPipelineWorker());
  workers.set(QUEUE_NAMES.TRANSCRIPTION, createTranscriptionWorker());
  workers.set(QUEUE_NAMES.NOTES, createNotesWorker());
  workers.set(QUEUE_NAMES.QUIZ, createQuizWorker());
  workers.set(QUEUE_NAMES.FLASHCARDS, createFlashcardsWorker());

  console.log('[BullMQ] All workers initialized');
  console.log('[BullMQ] Worker configuration:');

  for (const [name, config] of Object.entries(WORKER_CONFIG)) {
    console.log(`  - ${name}: concurrency=${config.concurrency}${config.limiter ? `, rate=${config.limiter.max}/${config.limiter.duration}ms` : ''}`);
  }
}

/**
 * Get worker instance
 */
export function getWorker(queueName) {
  return workers.get(queueName);
}

/**
 * Pause all workers
 */
export async function pauseAllWorkers() {
  console.log('[BullMQ] Pausing all workers...');

  for (const [name, worker] of workers) {
    await worker.pause();
    console.log(`[${name}] Worker paused`);
  }
}

/**
 * Resume all workers
 */
export async function resumeAllWorkers() {
  console.log('[BullMQ] Resuming all workers...');

  for (const [name, worker] of workers) {
    await worker.resume();
    console.log(`[${name}] Worker resumed`);
  }
}

/**
 * Close all workers (for graceful shutdown)
 */
export async function closeAllWorkers() {
  console.log('[BullMQ] Closing all workers...');

  for (const [name, worker] of workers) {
    await worker.close();
    console.log(`[${name}] Worker closed`);
  }

  workers.clear();
  console.log('[BullMQ] All workers closed');
}

/**
 * Get worker status
 */
export function getWorkersStatus() {
  const status = {};

  for (const [name, worker] of workers) {
    status[name] = {
      isRunning: worker.isRunning(),
      isPaused: worker.isPaused(),
      concurrency: WORKER_CONFIG[name]?.concurrency || 1
    };
  }

  return status;
}

// Export WORKER_CONFIG as named export (functions already exported inline)
export { WORKER_CONFIG };

export default {
  initializeWorkers,
  getWorker,
  pauseAllWorkers,
  resumeAllWorkers,
  closeAllWorkers,
  getWorkersStatus,
  WORKER_CONFIG
};
