/**
 * Modulate Velma-2 Audio Transcription Service
 * ============================================
 *
 * Production-ready audio transcription service using Modulate's
 * Velma-2-STT-Batch API.
 *
 * Endpoint: POST https://modulate-developer-apis.com/api/velma-2-stt-batch
 * Auth:     X-API-Key header
 * Body:     multipart/form-data with `upload_file` and optional enrichment flags
 *
 * Velma-2 multilingual batch transcription supports:
 *   - 70+ languages with automatic detection per utterance
 *   - Speaker diarization (default on)
 *   - Emotion detection (20+ emotions)
 *   - Accent detection (20+ accents)
 *   - PII / PHI tagging
 *   - Auto capitalization & punctuation
 *   - Audio files up to 100 MB
 *
 * Audio formats: AAC, AIFF, FLAC, MP3, MP4, MOV, OGG, Opus, WAV, WebM
 *
 * Implementation parity with mistralTranscriptionService.js so the
 * EnhancedTranscriptionProcessor / BullMQ workers can swap providers
 * transparently:
 *   - Same chunking flow (ffmpeg, 16kHz mono MP3 chunks)
 *   - Same TranscriptionResult shape (text, segments, confidence, ...)
 *   - Same progress tracker contract
 *
 * Author: Kora AI LMS
 * Version: 1.0.0
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import FormData from 'form-data';
import { createReadStream } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Velma API Configuration ───────────────────────────────────────────────
const VELMA_API_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes per chunk
const VELMA_API_URL = 'https://modulate-developer-apis.com/api/velma-2-stt-batch';
const VELMA_MODEL = 'velma-2-stt-batch';

// Velma allows files up to 100 MB, so chunks can be much larger than Mistral/Whisper.
// We still chunk to keep parallelism, progress reporting, and recovery granular.
// At 64 kbps mono 16 kHz MP3, a 20-minute chunk is ~9.6 MB → well under the 100 MB cap.
const CHUNK_DURATION_SECONDS = 1200; // 20 minutes
const MAX_AUDIO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Map file extension → MIME type that Modulate's decoder expects.
// (application/octet-stream is explicitly discouraged in the docs.)
const VELMA_MIME_MAP = {
  '.aac': 'audio/aac',
  '.aiff': 'audio/aiff',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.webm': 'video/webm'
};

function velmaMimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return VELMA_MIME_MAP[ext] || 'audio/mpeg';
}

/**
 * Velma Transcription Configuration
 */
export class VelmaTranscriptionConfig {
  constructor(options = {}) {
    this.model = options.model || VELMA_MODEL;
    this.language = options.language || null; // Velma auto-detects per utterance
    this.responseFormat = 'json'; // Velma always returns JSON

    // Enrichment flags (forwarded as form fields)
    this.speakerDiarization =
      options.speakerDiarization !== undefined ? options.speakerDiarization : true;
    this.emotionSignal =
      options.emotionSignal !== undefined ? options.emotionSignal : false;
    this.accentSignal =
      options.accentSignal !== undefined ? options.accentSignal : false;
    this.piiPhiTagging =
      options.piiPhiTagging !== undefined ? options.piiPhiTagging : false;

    // Chunking & concurrency
    this.maxConcurrentChunks = options.maxConcurrentChunks || 3;
    this.chunkDurationSeconds = options.chunkDurationSeconds || CHUNK_DURATION_SECONDS;

    // Progress / retry
    this.enableRealTimeProgress =
      options.enableRealTimeProgress !== undefined ? options.enableRealTimeProgress : true;
    this.enableRetry = options.enableRetry !== undefined ? options.enableRetry : true;
    this.maxRetries = options.maxRetries || 3;

    // Velma ignores prompt/temperature; kept for cross-provider API parity.
    this.prompt = options.prompt || null;
    this.temperature = options.temperature ?? 0.0;
  }
}

/**
 * Audio Analysis Result
 */
export class AudioAnalysis {
  constructor(data) {
    this.duration = data.duration || 0;
    this.fileSize = data.fileSize || 0;
    this.sampleRate = data.sampleRate || 16000;
    this.channels = data.channels || 1;
    this.bitRate = data.bitRate || 0;
    this.estimatedComplexity = data.estimatedComplexity || 'medium';
    this.recommendedChunkSize = data.recommendedChunkSize || CHUNK_DURATION_SECONDS;
    this.qualityScore = data.qualityScore || 0.5;
  }
}

/**
 * Transcription Result (shape identical to other providers)
 */
export class TranscriptionResult {
  constructor(data) {
    this.text = data.text || '';
    this.confidence = data.confidence || 0;
    this.segments = data.segments || [];
    this.language = data.language || 'en';
    this.duration = data.duration || 0;
    this.wordCount = data.wordCount || 0;
    this.qualityMetrics = data.qualityMetrics || {};
    this.processingTime = data.processingTime || 0;
    this.model = data.model || VELMA_MODEL;
  }
}

/**
 * Progress Tracker (shared contract with openai / mistral services)
 */
export class ProgressTracker extends EventEmitter {
  constructor(totalChunks, enableRealTime = true) {
    super();
    this.totalChunks = totalChunks;
    this.completedChunks = 0;
    this.failedChunks = 0;
    this.startTime = Date.now();
    this.enableRealTime = enableRealTime;
    this.currentText = '';

    if (enableRealTime) {
      this.startProgressUpdates();
    }
  }

  startProgressUpdates() {
    this.progressInterval = setInterval(() => {
      this.emit('progress', this.getProgress());
    }, 1000);
  }

  updateProgress(completed = true, failed = false, text = '') {
    if (completed) this.completedChunks++;
    if (failed) this.failedChunks++;
    if (text) this.currentText = text;

    if (this.enableRealTime) {
      this.emit('progress', this.getProgress());
    }
  }

  getProgress() {
    const elapsed = Date.now() - this.startTime;
    const progress = this.completedChunks / Math.max(this.totalChunks, 1);
    const eta = progress > 0 ? elapsed / progress - elapsed : 0;

    return {
      completed: this.completedChunks,
      total: this.totalChunks,
      failed: this.failedChunks,
      progress: Math.round(progress * 100),
      elapsed: Math.round(elapsed / 1000),
      eta: Math.round(eta / 1000),
      currentText: this.currentText.substring(0, 100)
    };
  }

  finish() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    this.emit('complete', this.getProgress());
  }
}

/**
 * Velma-2 Transcription Service
 */
export class VelmaTranscriptionService {
  constructor(apiKey, config = {}) {
    if (!apiKey) {
      throw new Error('Velma (Modulate) API key is required');
    }

    this.apiKey = apiKey;
    this.config = new VelmaTranscriptionConfig(config);
    this.isProcessing = false;
    this.apiUrl = VELMA_API_URL;
  }

  // ─── Audio analysis (mirrors mistral/openai) ─────────────────────────────
  async analyzeAudio(audioPath) {
    try {
      const stats = await fs.stat(audioPath);
      const fileSize = stats.size;

      let audioInfo = {};
      try {
        audioInfo = await this.getAudioMetadata(audioPath);
      } catch (error) {
        console.warn('[Velma] Could not get audio metadata:', error.message);
        audioInfo = { duration: 0, sampleRate: 16000, channels: 1, bitRate: 128000 };
      }

      const estimatedComplexity = this.estimateComplexity(fileSize, audioInfo);
      const qualityScore = this.calculateQualityScore(fileSize, audioInfo);

      return new AudioAnalysis({
        duration: audioInfo.duration,
        fileSize,
        sampleRate: audioInfo.sampleRate,
        channels: audioInfo.channels,
        bitRate: audioInfo.bitRate,
        estimatedComplexity,
        recommendedChunkSize: CHUNK_DURATION_SECONDS,
        qualityScore
      });
    } catch (error) {
      console.warn('[Velma] Audio analysis failed:', error.message);
      return new AudioAnalysis({
        duration: 0,
        fileSize: 0,
        estimatedComplexity: 'medium',
        recommendedChunkSize: CHUNK_DURATION_SECONDS,
        qualityScore: 0.5
      });
    }
  }

  async getAudioMetadata(audioPath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        audioPath
      ]);

      let stdout = '';
      let stderr = '';
      ffprobe.stdout.on('data', d => { stdout += d.toString(); });
      ffprobe.stderr.on('data', d => { stderr += d.toString(); });

      ffprobe.on('close', code => {
        if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr}`));
        try {
          const info = JSON.parse(stdout);
          const audioStream = info.streams?.find(s => s.codec_type === 'audio') || {};
          resolve({
            duration: parseFloat(info.format?.duration) || 0,
            sampleRate: parseInt(audioStream.sample_rate) || 16000,
            channels: parseInt(audioStream.channels) || 1,
            bitRate: parseInt(info.format?.bit_rate) || 128000
          });
        } catch (err) {
          reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
        }
      });

      ffprobe.on('error', err => reject(new Error(`ffprobe not available: ${err.message}`)));
    });
  }

  estimateComplexity(fileSize, audioInfo) {
    const duration = audioInfo.duration || 1;
    const bitRate = audioInfo.bitRate || 128000;
    const bitRateFactor = bitRate > 256000 ? 0.3 : 0.1;
    const durationFactor = Math.min(0.3, duration / 3600);
    const sizeFactor = Math.min(0.4, fileSize / (100 * 1024 * 1024));
    const complexity = bitRateFactor + durationFactor + sizeFactor;
    if (complexity > 0.7) return 'high';
    if (complexity > 0.4) return 'medium';
    return 'low';
  }

  calculateQualityScore(fileSize, audioInfo) {
    const bitRateScore = Math.min(1, (audioInfo.bitRate || 0) / 320000);
    const sampleRateScore = Math.min(1, (audioInfo.sampleRate || 0) / 48000);
    const channelScore = audioInfo.channels > 1 ? 0.8 : 0.6;
    return bitRateScore * 0.4 + sampleRateScore * 0.3 + channelScore * 0.3;
  }

  // ─── Chunking via ffmpeg ─────────────────────────────────────────────────
  async splitAudioIntoChunks(audioPath, chunkSizeSeconds = CHUNK_DURATION_SECONDS, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });

    const chunks = [];
    const audioInfo = await this.getAudioMetadata(audioPath);
    const duration = audioInfo.duration;

    console.log(`[Velma] Splitting audio (duration: ${duration}s) into ${chunkSizeSeconds}s chunks...`);

    let chunkIndex = 0;
    let startTime = 0;

    while (startTime < duration) {
      const endTime = Math.min(startTime + chunkSizeSeconds, duration);
      const chunkPath = path.join(
        outputDir,
        `chunk_${chunkIndex.toString().padStart(4, '0')}.mp3`
      );

      await this.extractAudioChunk(audioPath, startTime, endTime - startTime, chunkPath);

      const stats = await fs.stat(chunkPath);
      const chunkSizeMB = stats.size / (1024 * 1024);
      console.log(
        `[Velma] Chunk ${chunkIndex}: ${startTime}s-${endTime}s, Size: ${chunkSizeMB.toFixed(2)}MB`
      );

      chunks.push({
        path: chunkPath,
        index: chunkIndex,
        startTime,
        endTime,
        duration: endTime - startTime,
        size: stats.size,
        sizeMB: chunkSizeMB
      });

      startTime = endTime;
      chunkIndex++;
    }

    console.log(`[Velma] Created ${chunks.length} chunks`);
    return chunks;
  }

  async extractAudioChunk(inputPath, startTime, duration, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-i', inputPath,
        '-ac', '1',          // mono
        '-ar', '16000',      // 16 kHz (optimal for speech)
        '-b:a', '64k',
        '-c:a', 'libmp3lame',
        outputPath
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', d => { stderr += d.toString(); });

      ffmpeg.on('close', code => {
        if (code !== 0) reject(new Error(`ffmpeg failed: ${stderr}`));
        else resolve(outputPath);
      });

      ffmpeg.on('error', err => reject(new Error(`ffmpeg not available: ${err.message}`)));
    });
  }

  // ─── Single chunk transcription against Velma-2 API ──────────────────────
  async transcribeChunk(chunkPath, chunkInfo, progressTracker) {
    const startTime = Date.now();

    try {
      // Velma rejects files > 100 MB. Our chunks are tiny (~10 MB at 64kbps),
      // but guard anyway in case a caller passes a raw file.
      if (chunkInfo.size > MAX_AUDIO_SIZE_BYTES) {
        throw new Error(
          `Chunk ${chunkInfo.index} exceeds Velma's 100MB limit (${chunkInfo.sizeMB.toFixed(2)}MB)`
        );
      }

      console.log(
        `[Velma] Transcribing chunk ${chunkInfo.index} (${chunkInfo.startTime}s - ${chunkInfo.endTime}s)...`
      );

      const form = new FormData();
      form.append('upload_file', createReadStream(chunkPath), {
        filename: path.basename(chunkPath),
        contentType: velmaMimeForPath(chunkPath)
      });
      // Velma form fields must be strings.
      form.append('speaker_diarization', String(!!this.config.speakerDiarization));
      form.append('emotion_signal', String(!!this.config.emotionSignal));
      form.append('accent_signal', String(!!this.config.accentSignal));
      form.append('pii_phi_tagging', String(!!this.config.piiPhiTagging));

      const response = await this.requestWithRetry(form);
      const processingTime = Date.now() - startTime;

      const responseData = response.data || {};
      const text = (responseData.text || '').trim();
      const utterances = Array.isArray(responseData.utterances)
        ? responseData.utterances
        : [];

      // Velma returns ms-based utterances. Convert to seconds-based segments to
      // match Whisper/Voxtral's segment shape (start, end, text, speaker?, ...).
      const segments = utterances.map(u => ({
        id: u.utterance_uuid,
        start: (u.start_ms || 0) / 1000,
        end: ((u.start_ms || 0) + (u.duration_ms || 0)) / 1000,
        text: u.text || '',
        speaker: u.speaker,
        language: u.language,
        emotion: u.emotion ?? null,
        accent: u.accent ?? null
      }));

      const reportedDuration =
        typeof responseData.duration_ms === 'number'
          ? responseData.duration_ms / 1000
          : chunkInfo.duration;

      const language = segments[0]?.language || this.config.language || 'en';
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      const confidence = this.calculateConfidence({ text, segments }, wordCount);

      const transcriptionResult = new TranscriptionResult({
        text,
        confidence,
        segments,
        language,
        duration: reportedDuration,
        wordCount,
        processingTime,
        model: this.config.model,
        qualityMetrics: {
          chunkIndex: chunkInfo.index,
          chunkStartTime: chunkInfo.startTime,
          chunkEndTime: chunkInfo.endTime,
          wordCount,
          averageWordLength: wordCount > 0 ? text.length / wordCount : 0,
          utteranceCount: utterances.length,
          speakerDiarization: this.config.speakerDiarization,
          emotionSignal: this.config.emotionSignal,
          accentSignal: this.config.accentSignal,
          piiPhiTagging: this.config.piiPhiTagging
        }
      });

      progressTracker?.updateProgress(true, false, text);

      console.log(
        `[Velma] Chunk ${chunkInfo.index} transcribed (${wordCount} words, ${utterances.length} utterances, ${processingTime}ms)`
      );
      return transcriptionResult;
    } catch (error) {
      const status = error.response?.status;
      const responseBody = error.response?.data;
      const detail = responseBody?.detail
        || (typeof responseBody === 'string' ? responseBody : null)
        || error.message;
      console.error(
        `[Velma] Chunk ${chunkInfo.index} transcription failed (status=${status || 'no response'}, code=${error.code || 'n/a'}): ${detail}`
      );
      if (responseBody && typeof responseBody === 'object') {
        try {
          console.error('[Velma] Response body:', JSON.stringify(responseBody).slice(0, 500));
        } catch (_) { /* noop */ }
      }
      progressTracker?.updateProgress(true, true);

      return new TranscriptionResult({
        text: '',
        confidence: 0,
        segments: [],
        language: this.config.language || 'en',
        duration: 0,
        wordCount: 0,
        processingTime: Date.now() - startTime,
        model: this.config.model,
        qualityMetrics: {
          chunkIndex: chunkInfo.index,
          error: error.response?.data?.detail || error.message,
          chunkStartTime: chunkInfo.startTime,
          chunkEndTime: chunkInfo.endTime
        }
      });
    }
  }

  /**
   * POST a chunk form to Velma with light retry on transient errors.
   * Velma rate-limit semantics:
   *   429 → concurrent or monthly cap exceeded (retry briefly on concurrent)
   *   403 → model access not enabled / monthly cap exhausted (do not retry)
   *   401 → bad API key (do not retry)
   *   5xx → transient server error (retry with backoff)
   */
  async requestWithRetry(form) {
    const maxRetries = this.config.enableRetry ? this.config.maxRetries || 3 : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await axios.post(this.apiUrl, form, {
          headers: {
            ...form.getHeaders(),
            'X-API-Key': this.apiKey
          },
          timeout: VELMA_API_TIMEOUT_MS,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const detail = error.response?.data?.detail
          || (typeof error.response?.data === 'string' ? error.response.data : null)
          || error.message;

        // Non-retryable: bad creds, no access, bad payload.
        if (status === 401 || status === 403 || status === 400) {
          console.error(
            `[Velma] Non-retryable error (status=${status}): ${detail}`
          );
          throw error;
        }

        // Final attempt – propagate.
        if (attempt >= maxRetries) {
          console.error(
            `[Velma] Request failed after ${maxRetries} attempts (status=${status || 'no response'}, code=${error.code || 'n/a'}): ${detail}`
          );
          throw error;
        }

        // For 429 (Modulate's concurrent-limit signal) wait longer than the
        // default exponential backoff because the limit clears as in-flight
        // requests complete, not on a fixed schedule.
        const baseBackoff = status === 429 ? 5000 : 1000;
        const backoffMs = Math.min(30_000, baseBackoff * Math.pow(2, attempt - 1));
        console.warn(
          `[Velma] Request failed (attempt ${attempt}/${maxRetries}, status=${status || 'no response'}, code=${error.code || 'n/a'}): ${detail}. Retrying in ${backoffMs}ms...`
        );
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }

    throw lastError;
  }

  // ─── Confidence heuristic (Velma does not return a score) ────────────────
  calculateConfidence(result, wordCount) {
    if (!result.text || result.text.trim().length === 0) return 0;

    let confidence = 0.5;
    const avgWordLength = wordCount > 0 ? result.text.length / wordCount : 0;
    if (avgWordLength >= 4 && avgWordLength <= 8) confidence += 0.2;

    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const foundCommon = commonWords.filter(w => result.text.toLowerCase().includes(w)).length;
    if (foundCommon >= 3) confidence += 0.2;

    // Velma always returns utterance-level segmentation when it succeeds,
    // so segment presence is a useful additional signal.
    if (Array.isArray(result.segments) && result.segments.length > 0) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  // ─── Parallel chunk processor (semaphore pattern) ────────────────────────
  async processChunksParallel(chunks, progressTracker) {
    const results = new Array(chunks.length);
    const maxConcurrent = this.config.maxConcurrentChunks || 2;
    const semaphore = new Array(maxConcurrent).fill(null);

    console.log(`[Velma] Processing ${chunks.length} chunks with max concurrency: ${maxConcurrent}`);

    const processChunk = async (chunk, index) => {
      while (semaphore.every(slot => slot !== null)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const slotIndex = semaphore.findIndex(slot => slot === null);
      semaphore[slotIndex] = index;

      try {
        results[index] = await this.transcribeChunk(chunk.path, chunk, progressTracker);
      } catch (error) {
        console.error(`[Velma] Chunk ${index} processing failed:`, error);
        results[index] = new TranscriptionResult({
          text: '',
          confidence: 0,
          segments: [],
          language: this.config.language || 'en',
          duration: 0,
          wordCount: 0,
          processingTime: 0,
          model: this.config.model,
          qualityMetrics: {
            chunkIndex: index,
            error: error.message,
            chunkStartTime: chunk.startTime,
            chunkEndTime: chunk.endTime
          }
        });
      } finally {
        semaphore[slotIndex] = null;
      }
    };

    await Promise.all(chunks.map((chunk, index) => processChunk(chunk, index)));
    return results;
  }

  // ─── Combine chunk results ───────────────────────────────────────────────
  combineResults(results, chunks) {
    const validResults = results.filter(r => r.text && r.text.trim().length > 0);
    if (validResults.length === 0) {
      throw new Error('No valid transcription results from any chunks');
    }

    console.log(`[Velma] Combining ${validResults.length}/${chunks.length} valid chunks`);

    const sortedResults = validResults.sort(
      (a, b) => (a.qualityMetrics?.chunkIndex || 0) - (b.qualityMetrics?.chunkIndex || 0)
    );

    let combinedText = '';
    const combinedSegments = [];
    let totalWordCount = 0;
    let totalProcessingTime = 0;
    let totalConfidence = 0;
    let cumulativeTime = 0;

    for (const result of sortedResults) {
      if (combinedText && !combinedText.endsWith(' ')) combinedText += ' ';
      combinedText += result.text.trim();

      const chunkStartTime = result.qualityMetrics?.chunkStartTime ?? cumulativeTime;
      const adjustedSegments = (result.segments || []).map(seg => ({
        ...seg,
        start: (seg.start || 0) + chunkStartTime,
        end: (seg.end || 0) + chunkStartTime
      }));

      combinedSegments.push(...adjustedSegments);
      totalWordCount += result.wordCount || 0;
      totalProcessingTime += result.processingTime || 0;
      totalConfidence += result.confidence || 0;
      cumulativeTime += result.duration || 0;
    }

    const avgConfidence = sortedResults.length > 0 ? totalConfidence / sortedResults.length : 0;
    const totalDuration = chunks.reduce((sum, c) => sum + c.duration, 0);

    const combined = new TranscriptionResult({
      text: combinedText.trim(),
      confidence: avgConfidence,
      segments: combinedSegments,
      language: sortedResults[0].language || 'en',
      duration: totalDuration,
      wordCount: totalWordCount,
      processingTime: totalProcessingTime,
      model: this.config.model,
      qualityMetrics: {
        totalChunks: chunks.length,
        validChunks: validResults.length,
        failedChunks: chunks.length - validResults.length,
        averageConfidence: avgConfidence,
        processingStrategy: 'velma_chunked_20min',
        chunkDuration: this.config.chunkDurationSeconds,
        speakerDiarization: this.config.speakerDiarization,
        emotionSignal: this.config.emotionSignal,
        accentSignal: this.config.accentSignal,
        piiPhiTagging: this.config.piiPhiTagging
      }
    });

    console.log(
      `[Velma] Combined transcript: ${combined.text.length} chars, ${totalWordCount} words, avg confidence ${avgConfidence.toFixed(3)}`
    );

    return combined;
  }

  // ─── Public entry point (matches mistral/openai signature) ───────────────
  async transcribe(audioPath, options = {}) {
    if (this.isProcessing) {
      throw new Error('Velma transcription service is already processing');
    }

    this.isProcessing = true;
    const tempDir = path.join(TEMP_DIR, `velma_transcription_${Date.now()}`);

    try {
      if (!audioPath || !(await this.fileExists(audioPath))) {
        throw new Error('Audio file not found');
      }

      console.log('[Velma] Analyzing audio file...');
      const analysis = await this.analyzeAudio(audioPath);
      console.log('[Velma] Audio analysis:', {
        duration: `${analysis.duration.toFixed(2)}s`,
        fileSize: `${(analysis.fileSize / 1024 / 1024).toFixed(2)}MB`,
        complexity: analysis.estimatedComplexity
      });

      return await this.transcribeWithChunks(audioPath, analysis, options, tempDir);
    } finally {
      this.isProcessing = false;
      await this.cleanupTempFiles(tempDir);
    }
  }

  async transcribeWithChunks(audioPath, analysis, options, tempDir) {
    const chunkSize = this.config.chunkDurationSeconds || CHUNK_DURATION_SECONDS;

    console.log(`[Velma] Splitting audio into ${chunkSize}s chunks...`);
    const chunks = await this.splitAudioIntoChunks(audioPath, chunkSize, tempDir);
    console.log(`[Velma] Created ${chunks.length} chunks`);

    const progressTracker = new ProgressTracker(
      chunks.length,
      this.config.enableRealTimeProgress
    );
    if (options.onProgress) {
      progressTracker.on('progress', options.onProgress);
    }

    console.log('[Velma] Processing chunks...');
    const results = await this.processChunksParallel(chunks, progressTracker);
    progressTracker.finish();

    console.log('[Velma] Combining transcription results...');
    const finalResult = this.combineResults(results, chunks);

    console.log('[Velma] Transcription completed successfully');
    return finalResult;
  }

  // ─── Utility helpers ─────────────────────────────────────────────────────
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async cleanupTempFiles(tempDir) {
    try {
      const files = await fs.readdir(tempDir);
      await Promise.all(files.map(file => fs.unlink(path.join(tempDir, file))));
      await fs.rmdir(tempDir);
    } catch (error) {
      console.warn('[Velma] Failed to cleanup temp files:', error.message);
    }
  }
}

/**
 * Factory function
 */
export function createVelmaTranscriptionService(apiKey, config = {}) {
  return new VelmaTranscriptionService(apiKey, config);
}

export default VelmaTranscriptionService;
