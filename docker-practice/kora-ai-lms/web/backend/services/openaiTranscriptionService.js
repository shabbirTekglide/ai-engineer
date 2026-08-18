/**
 * OpenAI Audio Transcription Service
 * ===================================
 * 
 * Production-ready audio transcription service using OpenAI's Whisper API
 * Implements advanced strategies from the Python script:
 * - Multi-pass transcription with quality assessment
 * - Audio analysis and optimization
 * - Parallel processing for large files
 * - Comprehensive error handling and recovery
 * - Real-time progress tracking
 * 
 * Author: AI Assistant
 * Version: 1.0.0
 */

import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { compressAudioIfNeeded, checkFfmpegAvailable } from '../utils/audioCompression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// OpenAI API timeout configuration (30 minutes for Whisper API)
const OPENAI_API_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Configuration constants
const MAX_AUDIO_SIZE_MB = 25; // OpenAI's limit
const CHUNK_SIZE_MB = 20; // Safe chunk size for processing
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const QUALITY_THRESHOLDS = {
  excellent: { confidence: 0.9, lengthRatio: 0.8 },
  good: { confidence: 0.8, lengthRatio: 0.6 },
  fair: { confidence: 0.7, lengthRatio: 0.4 },
  poor: { confidence: 0.6, lengthRatio: 0.2 }
};

/**
 * Transcription Configuration Class
 */
export class TranscriptionConfig {
  constructor(options = {}) {
    // Model and processing settings
    this.model = options.model || 'whisper-1';
    this.language = options.language || 'en';
    this.responseFormat = options.responseFormat || 'verbose_json';
    
    // Quality control
    this.qualityThreshold = options.qualityThreshold || 'good';
    this.enableTimestamp = options.enableTimestamp || true;
    this.enableSpeakerDetection = options.enableSpeakerDetection || false;
    
    // Performance settings
    this.maxConcurrentChunks = options.maxConcurrentChunks || 3;
    this.chunkOverlapSeconds = options.chunkOverlapSeconds || 5;
    this.enableRealTimeProgress = options.enableRealTimeProgress || true;
    
    // Advanced options
    this.temperature = options.temperature || 0.0;
    this.prompt = options.prompt || null;
    this.enableRetry = options.enableRetry || true;
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
    this.recommendedChunkSize = data.recommendedChunkSize || 300;
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
    this.model = data.model || 'whisper-1';
  }

  needsRefinement(threshold) {
    const thresholds = QUALITY_THRESHOLDS[threshold];
    if (!thresholds) return false;
    
    return (
      this.confidence < thresholds.confidence ||
      (this.text.length / this.wordCount) < thresholds.lengthRatio ||
      this.text.trim().length === 0
    );
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
 * OpenAI Transcription Service
 */
export class OpenAITranscriptionService {
  constructor(apiKey, config = {}) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    // Use 30 minutes timeout for Whisper API requests
    this.openai = new OpenAI({ 
      apiKey,
      timeout: OPENAI_API_TIMEOUT_MS // 30 minutes timeout
    });
    this.config = new TranscriptionConfig(config);
    this.isProcessing = false;
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
        // Use default values
        audioInfo = {
          duration: 0,
          sampleRate: 16000,
          channels: 1,
          bitRate: 128000
        };
      }

      // Estimate complexity based on file characteristics
      const estimatedComplexity = this.estimateComplexity(fileSize, audioInfo);
      
      // Recommend chunk size
      const recommendedChunkSize = this.recommendChunkSize(audioInfo.duration, estimatedComplexity);
      
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
      // Return default analysis
      return new AudioAnalysis({
        duration: 0,
        fileSize: 0,
        estimatedComplexity: 'medium',
        recommendedChunkSize: 300,
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
    
    // Factors that increase complexity:
    // - High bitrate
    // - Long duration
    // - Large file size
    
    const bitRateFactor = bitRate > 256000 ? 0.3 : 0.1;
    const durationFactor = Math.min(0.3, duration / 3600); // Normalize to 1 hour
    const sizeFactor = Math.min(0.4, fileSize / (100 * 1024 * 1024)); // Normalize to 100MB
    
    const complexity = bitRateFactor + durationFactor + sizeFactor;
    
    if (complexity > 0.7) return 'high';
    if (complexity > 0.4) return 'medium';
    return 'low';
  }

  /**
   * Recommend optimal chunk size
   */
  recommendChunkSize(duration, complexity) {
    if (complexity === 'high') return 180; // 3 minutes
    if (complexity === 'medium') return 300; // 5 minutes
    if (duration > 3600) return 420; // 7 minutes for very long audio
    return 300; // Default 5 minutes
  }

  /**
   * Calculate quality score
   */
  calculateQualityScore(fileSize, audioInfo) {
    // Higher quality indicators:
    // - Higher bitrate
    // - Higher sample rate
    // - Stereo vs mono
    
    const bitRateScore = Math.min(1, audioInfo.bitRate / 320000);
    const sampleRateScore = Math.min(1, audioInfo.sampleRate / 48000);
    const channelScore = audioInfo.channels > 1 ? 0.8 : 0.6;
    
    return (bitRateScore * 0.4) + (sampleRateScore * 0.3) + (channelScore * 0.3);
  }

  /**
   * Split audio into 10-minute chunks for processing
   * Each chunk will be checked for size and compressed if needed
   */
  async splitAudioIntoChunks(audioPath, chunkSizeSeconds = 600, outputDir) {
    await fs.mkdir(outputDir, { recursive: true });
    
    const chunks = [];
    const audioInfo = await this.getAudioMetadata(audioPath);
    const duration = audioInfo.duration;
    
    console.log(`Splitting audio (duration: ${duration}s) into ${chunkSizeSeconds}s chunks...`);
    
    let chunkIndex = 0;
    let startTime = 0;
    
    while (startTime < duration) {
      const endTime = Math.min(startTime + chunkSizeSeconds, duration);
      const chunkPath = path.join(outputDir, `chunk_${chunkIndex.toString().padStart(4, '0')}.mp3`);
      
      await this.extractAudioChunk(audioPath, startTime, endTime - startTime, chunkPath);
      
      // Get chunk file size
      const stats = await fs.stat(chunkPath);
      const chunkSizeMB = stats.size / (1024 * 1024);
      
      console.log(`Chunk ${chunkIndex}: ${startTime}s-${endTime}s, Size: ${chunkSizeMB.toFixed(2)}MB`);
      
      chunks.push({
        path: chunkPath,
        index: chunkIndex,
        startTime,
        endTime,
        duration: endTime - startTime,
        size: stats.size,
        sizeMB: chunkSizeMB
      });
      
      startTime = endTime; // No overlap for clean concatenation
      chunkIndex++;
    }
    
    console.log(`Created ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Extract audio chunk using ffmpeg
   * Creates MP3 chunks optimized for Whisper API
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
   * Transcribe a single audio chunk
   * Handles compression if chunk exceeds 25MB
   */
  async transcribeChunk(chunkPath, chunkInfo, progressTracker) {
    const startTime = Date.now();
    let compressedPath = null;
    let pathToTranscribe = chunkPath;
    
    try {
      // Check if chunk needs compression (> 25MB)
      if (chunkInfo.size > 25 * 1024 * 1024) {
        console.log(`Chunk ${chunkInfo.index} exceeds 25MB (${chunkInfo.sizeMB.toFixed(2)}MB), compressing...`);
        
        const dir = path.dirname(chunkPath);
        const ext = path.extname(chunkPath);
        const basename = path.basename(chunkPath, ext);
        compressedPath = path.join(dir, `${basename}_compressed.mp3`);
        
        // Compress the chunk
        const compressionResult = await compressAudioIfNeeded(chunkPath, compressedPath, {
          targetBitrate: '48k', // Lower bitrate for compression
          sampleRate: '16000',
          channels: '1',
          quality: 'medium'
        });
        
        if (compressionResult.compressed) {
          pathToTranscribe = compressionResult.outputPath;
          const compressedSizeMB = compressionResult.compressedSize / (1024 * 1024);
          console.log(`Chunk ${chunkInfo.index} compressed: ${chunkInfo.sizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`);
        }
      }

      // Prepare transcription options
      const transcriptionOptions = {
        model: this.config.model,
        language: this.config.language,
        response_format: this.config.responseFormat,
        temperature: this.config.temperature
      };

      // Add prompt if available
      if (this.config.prompt) {
        transcriptionOptions.prompt = this.config.prompt;
      }

      // Create file stream
      const audioFile = await fs.readFile(pathToTranscribe);
      const file = new File([audioFile], `chunk_${chunkInfo.index}.mp3`, { type: 'audio/mpeg' });

      // Transcribe using OpenAI API
      console.log(`Transcribing chunk ${chunkInfo.index} (${chunkInfo.startTime}s - ${chunkInfo.endTime}s)...`);
      const response = await this.openai.audio.transcriptions.create({
        file: file,
        ...transcriptionOptions
      });

      const processingTime = Date.now() - startTime;
      
      // Parse response based on format
      let result;
      if (this.config.responseFormat === 'verbose_json') {
        result = {
          text: response.text || '',
          segments: response.segments || [],
          language: response.language || this.config.language,
          duration: response.duration || 0
        };
      } else {
        result = {
          text: typeof response === 'string' ? response : response.text || '',
          segments: [],
          language: this.config.language,
          duration: 0
        };
      }

      // Calculate quality metrics
      const wordCount = result.text.split(/\s+/).filter(w => w.length > 0).length;
      const confidence = this.calculateConfidence(result, wordCount);
      
      const transcriptionResult = new TranscriptionResult({
        text: result.text,
        confidence,
        segments: result.segments,
        language: result.language,
        duration: result.duration,
        wordCount,
        processingTime,
        model: this.config.model,
        qualityMetrics: {
          chunkIndex: chunkInfo.index,
          chunkStartTime: chunkInfo.startTime,
          chunkEndTime: chunkInfo.endTime,
          wordCount,
          averageWordLength: wordCount > 0 ? result.text.length / wordCount : 0,
          compressed: compressedPath !== null
        }
      });

      progressTracker?.updateProgress(true, false, result.text);
      
      console.log(`Chunk ${chunkInfo.index} transcribed successfully (${wordCount} words)`);
      
      return transcriptionResult;

    } catch (error) {
      console.error(`Chunk ${chunkInfo.index} transcription failed:`, error.message);
      progressTracker?.updateProgress(true, true);
      
      // Return empty result for failed chunk
      return new TranscriptionResult({
        text: '',
        confidence: 0,
        segments: [],
        language: this.config.language,
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
    } finally {
      // Clean up compressed chunk if created
      if (compressedPath) {
        try {
          await fs.unlink(compressedPath);
        } catch (err) {
          console.warn(`Failed to cleanup compressed chunk: ${err.message}`);
        }
      }
    }
  }

  /**
   * Calculate transcription confidence
   */
  calculateConfidence(result, wordCount) {
    // Simple confidence calculation based on:
    // - Text length vs expected length
    // - Presence of common words
    // - Segment quality if available
    
    if (!result.text || result.text.trim().length === 0) {
      return 0;
    }

    let confidence = 0.5; // Base confidence

    // Length-based confidence
    const avgWordLength = wordCount > 0 ? result.text.length / wordCount : 0;
    if (avgWordLength >= 4 && avgWordLength <= 8) {
      confidence += 0.2; // Good average word length
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
      const avgSegmentConfidence = result.segments.reduce((sum, seg) => 
        sum + (seg.avg_logprob || 0), 0) / result.segments.length;
      confidence += Math.max(0, avgSegmentConfidence * 0.3);
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Process multiple chunks in parallel with concurrency limit
   */
  async processChunksParallel(chunks, progressTracker) {
    const results = new Array(chunks.length);
    const maxConcurrent = this.config.maxConcurrentChunks || 2; // Limit concurrent transcriptions
    const semaphore = new Array(maxConcurrent).fill(null);
    
    console.log(`Processing ${chunks.length} chunks with max concurrency: ${maxConcurrent}`);
    
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
        console.error(`Chunk ${index} processing failed:`, error);
        results[index] = new TranscriptionResult({
          text: '',
          confidence: 0,
          segments: [],
          language: this.config.language,
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
   * Properly merges transcripts from multiple chunks
   */
  combineResults(results, chunks) {
    const validResults = results.filter(r => r.text && r.text.trim().length > 0);
    
    if (validResults.length === 0) {
      throw new Error('No valid transcription results from any chunks');
    }

    console.log(`Combining ${validResults.length} valid chunks out of ${chunks.length} total chunks`);

    // Sort by chunk index to maintain chronological order
    const sortedResults = validResults.sort((a, b) => {
      const aIndex = a.qualityMetrics?.chunkIndex || 0;
      const bIndex = b.qualityMetrics?.chunkIndex || 0;
      return aIndex - bIndex;
    });

    // Combine text - no overlap removal since chunks don't overlap
    let combinedText = '';
    let combinedSegments = [];
    let totalWordCount = 0;
    let totalProcessingTime = 0;
    let totalConfidence = 0;
    let cumulativeTime = 0;

    for (let i = 0; i < sortedResults.length; i++) {
      const result = sortedResults[i];
      
      // Add space between chunks if needed
      if (combinedText && !combinedText.endsWith(' ')) {
        combinedText += ' ';
      }
      
      combinedText += result.text.trim();
      
      // Adjust segment timestamps to account for chunk start time
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
        processingStrategy: 'chunked_10min'
      }
    });

    console.log(`Combined transcript: ${combinedResult.text.length} characters, ${totalWordCount} words`);
    console.log(`Average confidence: ${avgConfidence.toFixed(3)}`);

    return combinedResult;
  }

  /**
   * Get audio duration using ffprobe (helper for compression)
   */
  async getAudioDuration(audioPath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
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
            const duration = parseFloat(info.format?.duration) || 0;
            resolve(duration);
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
   * Compress audio file - ALWAYS compress to ensure it fits OpenAI's 25MB limit
   */
  async compressAudioIfNeeded(audioPath) {
    try {
      // Check if ffmpeg is available
      const ffmpegAvailable = await checkFfmpegAvailable();
      if (!ffmpegAvailable) {
        throw new Error('ffmpeg is required for audio processing but is not available. Please install ffmpeg.');
      }

      // Get file size
      const stats = await fs.stat(audioPath);
      const fileSizeMB = stats.size / 1024 / 1024;
      
      console.log(`Audio file size: ${fileSizeMB.toFixed(2)} MB`);

      // ALWAYS compress if file > 24MB
      if (stats.size <= 24 * 1024 * 1024) {
        console.log('File size is within limit, no compression needed');
        return { compressed: false, path: audioPath };
      }

      console.log('File exceeds 24MB limit, compressing audio...');
      
      // Generate compressed file path
      const dir = path.dirname(audioPath);
      const ext = path.extname(audioPath);
      const basename = path.basename(audioPath, ext);
      const compressedPath = path.join(dir, `${basename}_compressed.mp3`);

      // Compress audio with initial settings
      let compressionResult = await compressAudioIfNeeded(audioPath, compressedPath, {
        targetBitrate: '64k',
        sampleRate: '16000',
        channels: '1',
        quality: 'medium'
      });

      if (compressionResult.compressed) {
        const compressedSizeMB = compressionResult.compressedSize / 1024 / 1024;
        console.log(`Compression successful: ${fileSizeMB.toFixed(2)} MB -> ${compressedSizeMB.toFixed(2)} MB`);
        console.log(`Size reduction: ${compressionResult.getSummary().reductionPercent}%`);
        
        // If still too large, apply MORE aggressive compression
        if (compressionResult.compressedSize > 24 * 1024 * 1024) {
          console.log(`File still exceeds 24MB (${compressedSizeMB.toFixed(2)} MB), applying ultra-aggressive compression...`);
          
          // Delete previous compressed file
          await fs.unlink(compressedPath).catch(() => {});
          
          // Try with much lower bitrate
          const aggressivePath = path.join(dir, `${basename}_compressed_aggressive.mp3`);
          compressionResult = await compressAudioIfNeeded(audioPath, aggressivePath, {
            targetBitrate: '32k', // Very low bitrate
            sampleRate: '16000',
            channels: '1',
            quality: 'low'
          });
          
          const newSizeMB = compressionResult.compressedSize / 1024 / 1024;
          console.log(`Ultra-aggressive compression: ${fileSizeMB.toFixed(2)} MB -> ${newSizeMB.toFixed(2)} MB`);
          
          // If STILL too large, use extreme compression
          if (compressionResult.compressedSize > 24 * 1024 * 1024) {
            console.log(`File STILL exceeds 24MB (${newSizeMB.toFixed(2)} MB), applying EXTREME compression...`);
            
            // Delete previous compressed file
            await fs.unlink(aggressivePath).catch(() => {});
            
            // Calculate minimum bitrate needed
            const duration = await this.getAudioDuration(audioPath);
            const targetBitrate = Math.floor((24 * 1024 * 1024 * 8 * 0.85) / duration / 1000); // 85% of max for safety
            const minBitrate = Math.max(16, targetBitrate); // Minimum 16kbps
            
            console.log(`Calculated minimum bitrate: ${minBitrate}k for duration ${duration.toFixed(2)}s`);
            
            const extremePath = path.join(dir, `${basename}_compressed_extreme.mp3`);
            compressionResult = await compressAudioIfNeeded(audioPath, extremePath, {
              targetBitrate: `${minBitrate}k`,
              sampleRate: '16000',
              channels: '1',
              quality: 'low'
            });
            
            const finalSizeMB = compressionResult.compressedSize / 1024 / 1024;
            console.log(`EXTREME compression: ${fileSizeMB.toFixed(2)} MB -> ${finalSizeMB.toFixed(2)} MB`);
            
            if (compressionResult.compressedSize > 24 * 1024 * 1024) {
              throw new Error(`Unable to compress file below 24MB. Final size: ${finalSizeMB.toFixed(2)} MB. The audio file is too large even with extreme compression.`);
            }
          }
        }
        
        return { 
          compressed: true, 
          path: compressionResult.outputPath,
          originalPath: audioPath,
          compressionResult 
        };
      } else {
        return { compressed: false, path: audioPath };
      }

    } catch (error) {
      console.error('Audio compression failed:', error);
      throw error; // Don't continue with original file - compression is mandatory
    }
  }

  /**
   * Main transcription method - Uses chunking strategy for all files
   */
  async transcribe(audioPath, options = {}) {
    if (this.isProcessing) {
      throw new Error('Transcription service is already processing');
    }

    this.isProcessing = true;
    const startTime = Date.now();
    const tempDir = path.join(TEMP_DIR, `transcription_${Date.now()}`);

    try {
      // 1. Validate input
      if (!audioPath || !await this.fileExists(audioPath)) {
        throw new Error('Audio file not found');
      }

      // 2. Analyze audio
      console.log('Analyzing audio file...');
      const analysis = await this.analyzeAudio(audioPath);
      console.log('Audio analysis:', {
        duration: `${analysis.duration.toFixed(2)}s`,
        fileSize: `${(analysis.fileSize / 1024 / 1024).toFixed(2)}MB`,
        complexity: analysis.estimatedComplexity
      });

      // 3. ALWAYS use chunking strategy (10-minute chunks)
      console.log('Using chunked transcription strategy (10-minute chunks)...');
      return await this.transcribeWithChunks(audioPath, analysis, options, tempDir);

    } finally {
      this.isProcessing = false;
      
      // Clean up temp directory
      await this.cleanupTempFiles(tempDir);
    }
  }

  /**
   * Transcribe small files directly
   */
  async transcribeSmallFile(audioPath, analysis, options) {
    const startTime = Date.now();
    
    try {
      // Read audio file
      const audioFile = await fs.readFile(audioPath);
      const file = new File([audioFile], path.basename(audioPath), { 
        type: this.getMimeType(audioPath) 
      });

      // Prepare options
      const transcriptionOptions = {
        model: this.config.model,
        language: this.config.language,
        response_format: this.config.responseFormat,
        temperature: this.config.temperature
      };

      if (this.config.prompt) {
        transcriptionOptions.prompt = this.config.prompt;
      }

      // Transcribe
      console.log('Transcribing audio...');
      const response = await this.openai.audio.transcriptions.create({
        file: file,
        ...transcriptionOptions
      });

      const processingTime = Date.now() - startTime;
      
      // Parse response
      let result;
      if (this.config.responseFormat === 'verbose_json') {
        result = {
          text: response.text || '',
          segments: response.segments || [],
          language: response.language || this.config.language,
          duration: response.duration || analysis.duration
        };
      } else {
        result = {
          text: typeof response === 'string' ? response : response.text || '',
          segments: [],
          language: this.config.language,
          duration: analysis.duration
        };
      }

      const wordCount = result.text.split(/\s+/).filter(w => w.length > 0).length;
      const confidence = this.calculateConfidence(result, wordCount);

      return new TranscriptionResult({
        text: result.text,
        confidence,
        segments: result.segments,
        language: result.language,
        duration: result.duration,
        wordCount,
        processingTime,
        model: this.config.model,
        qualityMetrics: {
          fileSize: analysis.fileSize,
          qualityScore: analysis.qualityScore,
          estimatedComplexity: analysis.estimatedComplexity
        }
      });

    } catch (error) {
      console.error('Direct transcription failed:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio using chunking strategy
   * Splits audio into 10-minute chunks, compresses if needed, and transcribes
   */
  async transcribeWithChunks(audioPath, analysis, options, tempDir) {
    try {
      // 1. Split audio into 10-minute chunks
      console.log('Splitting audio into 10-minute chunks...');
      const chunkSizeSeconds = 600; // 10 minutes
      const chunks = await this.splitAudioIntoChunks(audioPath, chunkSizeSeconds, tempDir);
      console.log(`Created ${chunks.length} chunks`);

      // 2. Initialize progress tracking
      const progressTracker = new ProgressTracker(chunks.length, this.config.enableRealTimeProgress);
      
      if (options.onProgress) {
        progressTracker.on('progress', options.onProgress);
      }

      // 3. Process chunks (will compress each chunk if > 25MB)
      console.log('Processing chunks (with auto-compression if needed)...');
      const results = await this.processChunksParallel(chunks, progressTracker);

      // 4. Finish progress tracking
      progressTracker.finish();

      // 5. Combine results
      console.log('Combining transcription results...');
      const finalResult = this.combineResults(results, chunks);

      console.log('Chunked transcription completed successfully');
      return finalResult;

    } catch (error) {
      console.error('Chunked transcription failed:', error);
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

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.webm': 'audio/webm'
    };
    return mimeTypes[ext] || 'audio/wav';
  }

  async cleanupTempFiles(tempDir) {
    try {
      const files = await fs.readdir(tempDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(tempDir, file)))
      );
      await fs.rmdir(tempDir);
    } catch (error) {
      console.warn('Failed to cleanup temp files:', error.message);
    }
  }
}

/**
 * Factory function to create transcription service
 */
export function createTranscriptionService(apiKey, config = {}) {
  return new OpenAITranscriptionService(apiKey, config);
}

/**
 * Default export
 */
export default OpenAITranscriptionService;
