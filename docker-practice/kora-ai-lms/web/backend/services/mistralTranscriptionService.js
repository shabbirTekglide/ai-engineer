/**
 * Mistral AI Audio Transcription Service
 * =======================================
 * 
 * Production-ready audio transcription service using Mistral AI's Voxtral API
 * Implements chunking strategy for long audio files with 12-minute chunks
 * to stay under the 16K token limit
 * 
 * Configuration:
 * - Model: voxtral-mini-latest
 * - Chunk Duration: 720 seconds (12 minutes)
 * - Max Token Limit: 16384
 * - API Endpoint: https://api.mistral.ai/v1/audio/transcriptions
 * 
 * Author: AI Assistant
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

// Mistral API Configuration
const MISTRAL_API_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/audio/transcriptions';
const MISTRAL_MODEL = 'voxtral-mini-latest';

// Configuration constants - Optimized for Mistral's 16K token limit
const CHUNK_DURATION_SECONDS = 720; // 12 minutes - stays under 16K token limit
const MAX_TOKEN_LIMIT = 16384; // Reference for future optimization
const MAX_AUDIO_SIZE_MB = 25; // Safe chunk size for processing
const TEMP_DIR = path.join(__dirname, '..', 'temp');

/**
 * Transcription Configuration Class for Mistral
 */
export class MistralTranscriptionConfig {
  constructor(options = {}) {
    // Model and processing settings
    this.model = options.model || MISTRAL_MODEL;
    this.language = options.language || 'en';
    this.responseFormat = options.responseFormat || 'json';
    
    // Quality control
    this.enableTimestamp = options.enableTimestamp !== undefined ? options.enableTimestamp : true;
    
    // Performance settings - Optimized for 12-minute chunks
    this.maxConcurrentChunks = options.maxConcurrentChunks || 3;
    this.chunkDurationSeconds = options.chunkDurationSeconds || CHUNK_DURATION_SECONDS;
    this.enableRealTimeProgress = options.enableRealTimeProgress !== undefined ? options.enableRealTimeProgress : true;
    
    // Advanced options
    this.temperature = options.temperature || 0.0;
    this.prompt = options.prompt || null;
    this.enableRetry = options.enableRetry !== undefined ? options.enableRetry : true;
    this.maxRetries = options.maxRetries || 3;
  }
}

/**
 * Audio Analysis Result Class
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
 * Transcription Result Class
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
    this.model = data.model || MISTRAL_MODEL;
  }
}

/**
 * Progress Tracker Class
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
    const eta = progress > 0 ? (elapsed / progress) - elapsed : 0;
    
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
 * Mistral AI Transcription Service
 */
export class MistralTranscriptionService {
  constructor(apiKey, config = {}) {
    if (!apiKey) {
      throw new Error('Mistral API key is required');
    }
    
    this.apiKey = apiKey;
    this.config = new MistralTranscriptionConfig(config);
    this.isProcessing = false;
    this.apiUrl = MISTRAL_API_URL;
  }

  /**
   * Analyze audio file for optimization
   */
  async analyzeAudio(audioPath) {
    try {
      const stats = await fs.stat(audioPath);
      const fileSize = stats.size;
      
      // Get audio metadata using ffprobe if available
      let audioInfo = {};
      try {
        audioInfo = await this.getAudioMetadata(audioPath);
      } catch (error) {
        console.warn('Could not get audio metadata:', error.message);
        audioInfo = {
          duration: 0,
          sampleRate: 16000,
          channels: 1,
          bitRate: 128000
        };
      }

      // Estimate complexity based on file characteristics
      const estimatedComplexity = this.estimateComplexity(fileSize, audioInfo);
      
      // Recommend chunk size (default to 12 minutes for Mistral)
      const recommendedChunkSize = CHUNK_DURATION_SECONDS;
      
      // Calculate quality score
      const qualityScore = this.calculateQualityScore(fileSize, audioInfo);

      return new AudioAnalysis({
        duration: audioInfo.duration,
        fileSize: fileSize,
        sampleRate: audioInfo.sampleRate,
        channels: audioInfo.channels,
        bitRate: audioInfo.bitRate,
        estimatedComplexity,
        recommendedChunkSize,
        qualityScore
      });

    } catch (error) {
      console.warn('Audio analysis failed:', error.message);
      return new AudioAnalysis({
        duration: 0,
        fileSize: 0,
        estimatedComplexity: 'medium',
        recommendedChunkSize: CHUNK_DURATION_SECONDS,
        qualityScore: 0.5
      });
    }
  }

  /**
   * Get audio metadata using ffprobe
   */
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

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed: ${stderr}`));
        } else {
          try {
            const info = JSON.parse(stdout);
            const audioStream = info.streams?.find(s => s.codec_type === 'audio') || {};
            
            resolve({
              duration: parseFloat(info.format?.duration) || 0,
              sampleRate: parseInt(audioStream.sample_rate) || 16000,
              channels: parseInt(audioStream.channels) || 1,
              bitRate: parseInt(info.format?.bit_rate) || 128000
            });
          } catch (error) {
            reject(new Error(`Failed to parse ffprobe output: ${error.message}`));
          }
        }
      });

      ffprobe.on('error', (error) => {
        reject(new Error(`ffprobe not available: ${error.message}`));
      });
    });
  }

  /**
   * Estimate audio complexity
   */
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

  /**
   * Calculate quality score
   */
  calculateQualityScore(fileSize, audioInfo) {
    const bitRateScore = Math.min(1, audioInfo.bitRate / 320000);
    const sampleRateScore = Math.min(1, audioInfo.sampleRate / 48000);
    const channelScore = audioInfo.channels > 1 ? 0.8 : 0.6;
    
    return (bitRateScore * 0.4) + (sampleRateScore * 0.3) + (channelScore * 0.3);
  }

  /**
   * Split audio into 12-minute chunks for processing
   */
  async splitAudioIntoChunks(audioPath, chunkSizeSeconds = CHUNK_DURATION_SECONDS, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    
    const chunks = [];
    const audioInfo = await this.getAudioMetadata(audioPath);
    const duration = audioInfo.duration;
    
    console.log(`[Mistral] Splitting audio (duration: ${duration}s) into ${chunkSizeSeconds}s chunks...`);
    
    let chunkIndex = 0;
    let startTime = 0;
    
    while (startTime < duration) {
      const endTime = Math.min(startTime + chunkSizeSeconds, duration);
      const chunkPath = path.join(outputDir, `chunk_${chunkIndex.toString().padStart(4, '0')}.mp3`);
      
      await this.extractAudioChunk(audioPath, startTime, endTime - startTime, chunkPath);
      
      const stats = await fs.stat(chunkPath);
      const chunkSizeMB = stats.size / (1024 * 1024);
      
      console.log(`[Mistral] Chunk ${chunkIndex}: ${startTime}s-${endTime}s, Size: ${chunkSizeMB.toFixed(2)}MB`);
      
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
    
    console.log(`[Mistral] Created ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Extract audio chunk using ffmpeg
   * Creates MP3 chunks optimized for Mistral API
   */
  async extractAudioChunk(inputPath, startTime, duration, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-i', inputPath,
        '-ac', '1', // Mono
        '-ar', '16000', // 16kHz sample rate (optimal for speech)
        '-b:a', '64k', // 64kbps bitrate (good for speech)
        '-c:a', 'libmp3lame', // MP3 codec
        outputPath
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed: ${stderr}`));
        } else {
          resolve(outputPath);
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`ffmpeg not available: ${error.message}`));
      });
    });
  }

  /**
   * Transcribe a single audio chunk using Mistral API
   */
  async transcribeChunk(chunkPath, chunkInfo, progressTracker) {
    const startTime = Date.now();
    
    try {
      console.log(`[Mistral] Transcribing chunk ${chunkInfo.index} (${chunkInfo.startTime}s - ${chunkInfo.endTime}s)...`);
      
      // Create form data for multipart upload
      const form = new FormData();
      form.append('file', createReadStream(chunkPath));
      form.append('model', this.config.model);
      
      if (this.config.language) {
        form.append('language', this.config.language);
      }
      
      if (this.config.prompt) {
        form.append('prompt', this.config.prompt);
      }
      
      if (this.config.responseFormat) {
        form.append('response_format', this.config.responseFormat);
      }
      
      if (this.config.temperature !== undefined) {
        form.append('temperature', this.config.temperature.toString());
      }

      // Make API request to Mistral
      const response = await axios.post(this.apiUrl, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: MISTRAL_API_TIMEOUT_MS,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      const processingTime = Date.now() - startTime;
      
      // Parse response
      const responseData = response.data;
      let text = '';
      let segments = [];
      let language = this.config.language || 'en';
      let duration = chunkInfo.duration;

      if (typeof responseData === 'string') {
        text = responseData;
      } else if (responseData.text) {
        text = responseData.text;
        segments = responseData.segments || [];
        language = responseData.language || language;
        duration = responseData.duration || duration;
      }

      // Calculate quality metrics
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      const confidence = this.calculateConfidence({ text, segments }, wordCount);
      
      const transcriptionResult = new TranscriptionResult({
        text: text,
        confidence,
        segments: segments,
        language: language,
        duration: duration,
        wordCount,
        processingTime,
        model: this.config.model,
        qualityMetrics: {
          chunkIndex: chunkInfo.index,
          chunkStartTime: chunkInfo.startTime,
          chunkEndTime: chunkInfo.endTime,
          wordCount,
          averageWordLength: wordCount > 0 ? text.length / wordCount : 0
        }
      });

      progressTracker?.updateProgress(true, false, text);
      
      console.log(`[Mistral] Chunk ${chunkInfo.index} transcribed successfully (${wordCount} words, ${processingTime}ms)`);
      
      return transcriptionResult;

    } catch (error) {
      console.error(`[Mistral] Chunk ${chunkInfo.index} transcription failed:`, error.message);
      progressTracker?.updateProgress(true, true);
      
      // Return empty result for failed chunk
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
          error: error.message,
          chunkStartTime: chunkInfo.startTime,
          chunkEndTime: chunkInfo.endTime
        }
      });
    }
  }

  /**
   * Calculate transcription confidence
   */
  calculateConfidence(result, wordCount) {
    if (!result.text || result.text.trim().length === 0) {
      return 0;
    }

    let confidence = 0.5;

    // Length-based confidence
    const avgWordLength = wordCount > 0 ? result.text.length / wordCount : 0;
    if (avgWordLength >= 4 && avgWordLength <= 8) {
      confidence += 0.2;
    }

    // Common word presence
    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const foundCommonWords = commonWords.filter(word => 
      result.text.toLowerCase().includes(word)
    ).length;
    
    if (foundCommonWords >= 3) {
      confidence += 0.2;
    }

    // Segment quality if available
    if (result.segments && result.segments.length > 0) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Process multiple chunks in parallel with concurrency limit
   */
  async processChunksParallel(chunks, progressTracker) {
    const results = new Array(chunks.length);
    const maxConcurrent = this.config.maxConcurrentChunks || 2;
    const semaphore = new Array(maxConcurrent).fill(null);
    
    console.log(`[Mistral] Processing ${chunks.length} chunks with max concurrency: ${maxConcurrent}`);
    
    const processChunk = async (chunk, index) => {
      // Wait for available slot
      while (semaphore.every(slot => slot !== null)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Find available slot
      const slotIndex = semaphore.findIndex(slot => slot === null);
      semaphore[slotIndex] = index;
      
      try {
        const result = await this.transcribeChunk(chunk.path, chunk, progressTracker);
        results[index] = result;
      } catch (error) {
        console.error(`[Mistral] Chunk ${index} processing failed:`, error);
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

    // Start processing all chunks
    const promises = chunks.map((chunk, index) => processChunk(chunk, index));
    await Promise.all(promises);

    return results;
  }

  /**
   * Combine chunk results into final transcription
   */
  combineResults(results, chunks) {
    const validResults = results.filter(r => r.text && r.text.trim().length > 0);
    
    if (validResults.length === 0) {
      throw new Error('No valid transcription results from any chunks');
    }

    console.log(`[Mistral] Combining ${validResults.length} valid chunks out of ${chunks.length} total chunks`);

    // Sort by chunk index
    const sortedResults = validResults.sort((a, b) => {
      const aIndex = a.qualityMetrics?.chunkIndex || 0;
      const bIndex = b.qualityMetrics?.chunkIndex || 0;
      return aIndex - bIndex;
    });

    // Combine text
    let combinedText = '';
    let combinedSegments = [];
    let totalWordCount = 0;
    let totalProcessingTime = 0;
    let totalConfidence = 0;
    let cumulativeTime = 0;

    for (let i = 0; i < sortedResults.length; i++) {
      const result = sortedResults[i];
      
      if (combinedText && !combinedText.endsWith(' ')) {
        combinedText += ' ';
      }
      
      combinedText += result.text.trim();
      
      // Adjust segment timestamps
      const chunkStartTime = result.qualityMetrics?.chunkStartTime || cumulativeTime;
      const adjustedSegments = result.segments.map(seg => ({
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
    const totalDuration = chunks.reduce((sum, chunk) => sum + chunk.duration, 0);

    const combinedResult = new TranscriptionResult({
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
        processingStrategy: 'mistral_chunked_12min',
        chunkDuration: CHUNK_DURATION_SECONDS,
        maxTokenLimit: MAX_TOKEN_LIMIT
      }
    });

    console.log(`[Mistral] Combined transcript: ${combinedResult.text.length} characters, ${totalWordCount} words`);
    console.log(`[Mistral] Average confidence: ${avgConfidence.toFixed(3)}`);

    return combinedResult;
  }

  /**
   * Main transcription method - Uses 12-minute chunking strategy
   */
  async transcribe(audioPath, options = {}) {
    if (this.isProcessing) {
      throw new Error('Mistral transcription service is already processing');
    }

    this.isProcessing = true;
    const startTime = Date.now();
    const tempDir = path.join(TEMP_DIR, `mistral_transcription_${Date.now()}`);

    try {
      // Validate input
      if (!audioPath || !await this.fileExists(audioPath)) {
        throw new Error('Audio file not found');
      }

      // Analyze audio
      console.log('[Mistral] Analyzing audio file...');
      const analysis = await this.analyzeAudio(audioPath);
      console.log('[Mistral] Audio analysis:', {
        duration: `${analysis.duration.toFixed(2)}s`,
        fileSize: `${(analysis.fileSize / 1024 / 1024).toFixed(2)}MB`,
        complexity: analysis.estimatedComplexity
      });

      // Use 12-minute chunking strategy
      console.log('[Mistral] Using 12-minute chunking strategy...');
      return await this.transcribeWithChunks(audioPath, analysis, options, tempDir);

    } finally {
      this.isProcessing = false;
      
      // Clean up temp directory
      await this.cleanupTempFiles(tempDir);
    }
  }

  /**
   * Transcribe audio using 12-minute chunking strategy
   */
  async transcribeWithChunks(audioPath, analysis, options, tempDir) {
    try {
      // Split audio into 12-minute chunks
      console.log('[Mistral] Splitting audio into 12-minute chunks...');
      const chunks = await this.splitAudioIntoChunks(audioPath, CHUNK_DURATION_SECONDS, tempDir);
      console.log(`[Mistral] Created ${chunks.length} chunks`);

      // Initialize progress tracking
      const progressTracker = new ProgressTracker(chunks.length, this.config.enableRealTimeProgress);
      
      if (options.onProgress) {
        progressTracker.on('progress', options.onProgress);
      }

      // Process chunks
      console.log('[Mistral] Processing chunks...');
      const results = await this.processChunksParallel(chunks, progressTracker);

      // Finish progress tracking
      progressTracker.finish();

      // Combine results
      console.log('[Mistral] Combining transcription results...');
      const finalResult = this.combineResults(results, chunks);

      console.log('[Mistral] Transcription completed successfully');
      return finalResult;

    } catch (error) {
      console.error('[Mistral] Chunked transcription failed:', error);
      throw error;
    }
  }

  /**
   * Utility methods
   */
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
      await Promise.all(
        files.map(file => fs.unlink(path.join(tempDir, file)))
      );
      await fs.rmdir(tempDir);
    } catch (error) {
      console.warn('[Mistral] Failed to cleanup temp files:', error.message);
    }
  }
}

/**
 * Factory function to create Mistral transcription service
 */
export function createMistralTranscriptionService(apiKey, config = {}) {
  return new MistralTranscriptionService(apiKey, config);
}

/**
 * Default export
 */
export default MistralTranscriptionService;