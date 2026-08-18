/**
 * Audio Compression Utility
 * =========================
 * 
 * Utility for compressing audio files to meet OpenAI's 25MB limit
 * Uses ffmpeg to compress audio while maintaining acceptable quality for transcription
 * 
 * Features:
 * - Automatic compression for files exceeding size limit
 * - Optimized settings for speech transcription
 * - Progress tracking and error handling
 * - Cleanup of temporary files
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration constants
const MAX_SIZE_MB = 24; // Keep below 25MB with safety margin
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/**
 * Compression Configuration
 */
export class CompressionConfig {
  constructor(options = {}) {
    // Target settings for compressed audio
    this.targetBitrate = options.targetBitrate || '64k'; // Good for speech
    this.sampleRate = options.sampleRate || '16000'; // 16kHz (standard for speech)
    this.channels = options.channels || '1'; // Mono
    this.codec = options.codec || 'libmp3lame'; // MP3 codec (supported by Whisper-1)
    this.format = options.format || 'mp3'; // MP3 format (supported by Whisper-1)
    
    // Advanced options
    this.quality = options.quality || 'medium'; // low, medium, high
    this.vbr = options.vbr !== false; // Variable bitrate (enabled by default)
    
    // Calculate target size
    this.maxSizeBytes = options.maxSizeBytes || MAX_SIZE_BYTES;
  }

  /**
   * Get quality-based settings
   */
  getQualitySettings() {
    const settings = {
      low: {
        bitrate: '32k',
        sampleRate: '16000',
        compressionLevel: 10 // Max compression
      },
      medium: {
        bitrate: '64k',
        sampleRate: '16000',
        compressionLevel: 5
      },
      high: {
        bitrate: '96k',
        sampleRate: '24000',
        compressionLevel: 3
      }
    };
    
    return settings[this.quality] || settings.medium;
  }
}

/**
 * Audio Compression Result
 */
export class CompressionResult {
  constructor(data) {
    this.outputPath = data.outputPath;
    this.originalSize = data.originalSize;
    this.compressedSize = data.compressedSize;
    this.compressionRatio = data.compressionRatio;
    this.processingTime = data.processingTime;
    this.codec = data.codec;
    this.bitrate = data.bitrate;
  }

  /**
   * Check if compression was successful
   */
  isCompressed() {
    return this.compressedSize < this.originalSize;
  }

  /**
   * Get size reduction percentage
   */
  getSizeReduction() {
    return Math.round((1 - this.compressedSize / this.originalSize) * 100);
  }

  /**
   * Get compression summary
   */
  getSummary() {
    return {
      originalSizeMB: (this.originalSize / 1024 / 1024).toFixed(2),
      compressedSizeMB: (this.compressedSize / 1024 / 1024).toFixed(2),
      reductionPercent: this.getSizeReduction(),
      compressionRatio: this.compressionRatio.toFixed(2),
      processingTimeMs: this.processingTime
    };
  }
}

/**
 * Audio Compressor Class
 */
export class AudioCompressor {
  constructor(config = {}) {
    this.config = new CompressionConfig(config);
  }

  /**
   * Check if file needs compression
   */
  async needsCompression(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size > this.config.maxSizeBytes;
    } catch (error) {
      throw new Error(`Failed to check file size: ${error.message}`);
    }
  }

  /**
   * Get file size in bytes
   */
  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      throw new Error(`Failed to get file size: ${error.message}`);
    }
  }

  /**
   * Calculate target bitrate based on duration and target size
   */
  calculateTargetBitrate(durationSeconds, targetSizeBytes) {
    // bitrate (bits/sec) = (target_size_bytes * 8) / duration_seconds
    const targetBitrate = Math.floor((targetSizeBytes * 8) / durationSeconds);
    
    // Ensure minimum quality (16kbps) and maximum (128kbps)
    const minBitrate = 16000; // 16 kbps
    const maxBitrate = 128000; // 128 kbps
    
    return Math.max(minBitrate, Math.min(targetBitrate, maxBitrate));
  }

  /**
   * Get audio duration using ffprobe
   */
  async getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath
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
   * Compress audio file
   */
  async compress(inputPath, outputPath = null) {
    const startTime = Date.now();
    
    try {
      // Get original file size
      const originalSize = await this.getFileSize(inputPath);
      
      // Generate output path if not provided
      if (!outputPath) {
        const dir = path.dirname(inputPath);
        const ext = path.extname(inputPath);
        const basename = path.basename(inputPath, ext);
        outputPath = path.join(dir, `${basename}_compressed.mp3`);
      }

      // Get audio duration for bitrate calculation
      let duration = 0;
      try {
        duration = await this.getAudioDuration(inputPath);
        console.log(`Audio duration: ${duration.toFixed(2)} seconds`);
      } catch (error) {
        console.warn('Could not determine audio duration, using default bitrate');
      }

      // Calculate optimal bitrate if duration is available
      let targetBitrate = this.config.targetBitrate;
      if (duration > 0 && originalSize > this.config.maxSizeBytes) {
        // Calculate bitrate needed to reach target size
        const calculatedBitrate = this.calculateTargetBitrate(duration, this.config.maxSizeBytes * 0.9); // 90% of max for safety
        targetBitrate = `${Math.floor(calculatedBitrate / 1000)}k`;
        console.log(`Calculated target bitrate: ${targetBitrate}`);
      }

      // Get quality settings
      const qualitySettings = this.config.getQualitySettings();

      // Compress audio using ffmpeg with optimized settings for speech
      console.log(`Compressing audio: ${inputPath} -> ${outputPath}`);
      console.log(`Settings: bitrate=${targetBitrate}, sampleRate=${this.config.sampleRate}, channels=${this.config.channels}`);
      
      await this.compressWithFfmpeg(inputPath, outputPath, targetBitrate, qualitySettings);

      // Get compressed file size
      const compressedSize = await this.getFileSize(outputPath);
      const processingTime = Date.now() - startTime;

      // Check if compression was successful
      if (compressedSize >= originalSize) {
        console.warn('Compression did not reduce file size significantly');
      }

      // Check if compressed file is still too large
      if (compressedSize > this.config.maxSizeBytes) {
        console.warn(`Compressed file (${(compressedSize / 1024 / 1024).toFixed(2)} MB) still exceeds size limit. Attempting more aggressive compression...`);
        
        // Try more aggressive compression
        const aggressiveOutputPath = outputPath.replace('.mp3', '_aggressive.mp3');
        const aggressiveBitrate = Math.floor(parseInt(targetBitrate) * 0.7) + 'k'; // 70% of original bitrate
        
        await this.compressWithFfmpeg(inputPath, aggressiveOutputPath, aggressiveBitrate, {
          ...qualitySettings,
          compressionLevel: 10
        });

        const aggressiveSize = await this.getFileSize(aggressiveOutputPath);
        
        if (aggressiveSize < compressedSize) {
          // Use aggressive version
          await fs.unlink(outputPath);
          await fs.rename(aggressiveOutputPath, outputPath);
          
          return new CompressionResult({
            outputPath,
            originalSize,
            compressedSize: aggressiveSize,
            compressionRatio: originalSize / aggressiveSize,
            processingTime,
            codec: this.config.codec,
            bitrate: aggressiveBitrate
          });
        } else {
          // Keep original compressed version
          await fs.unlink(aggressiveOutputPath).catch(() => {});
        }
      }

      const result = new CompressionResult({
        outputPath,
        originalSize,
        compressedSize,
        compressionRatio: originalSize / compressedSize,
        processingTime,
        codec: this.config.codec,
        bitrate: targetBitrate
      });

      console.log('Compression summary:', result.getSummary());

      return result;

    } catch (error) {
      console.error('Audio compression failed:', error);
      throw new Error(`Audio compression failed: ${error.message}`);
    }
  }

  /**
   * Compress audio using ffmpeg
   */
  async compressWithFfmpeg(inputPath, outputPath, bitrate, qualitySettings) {
    return new Promise((resolve, reject) => {
      // MP3-specific arguments (different from Opus)
      // For MP3, we use constant bitrate (CBR) to ensure predictable file sizes
      // This is important for meeting the 25MB limit for Whisper-1
      const args = [
        '-y', // Overwrite output file
        '-hide_banner',
        '-loglevel', 'error',
        '-i', inputPath,
        '-ac', this.config.channels, // Audio channels (mono)
        '-ar', qualitySettings.sampleRate || this.config.sampleRate, // Sample rate
        '-c:a', this.config.codec, // Audio codec (libmp3lame for MP3)
        '-b:a', bitrate // Constant bitrate (CBR) for predictable file size
      ];
      
      args.push(outputPath);

      console.log('ffmpeg command:', 'ffmpeg', args.join(' '));

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed (code ${code}): ${stderr}`));
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
   * Compress audio file if needed (convenience method)
   */
  async compressIfNeeded(inputPath, outputPath = null) {
    const needsCompression = await this.needsCompression(inputPath);
    
    if (!needsCompression) {
      const size = await this.getFileSize(inputPath);
      console.log(`File size (${(size / 1024 / 1024).toFixed(2)} MB) is within limit, skipping compression`);
      
      // Return a CompressionResult instance for consistency
      const result = new CompressionResult({
        outputPath: inputPath,
        originalSize: size,
        compressedSize: size,
        compressionRatio: 1,
        processingTime: 0,
        codec: 'none',
        bitrate: 'none'
      });
      
      result.compressed = false;
      return result;
    }

    console.log(`File exceeds size limit, compressing...`);
    const result = await this.compress(inputPath, outputPath);
    result.compressed = true;
    
    return result;
  }
}

/**
 * Convenience function to compress audio file
 */
export async function compressAudio(inputPath, outputPath = null, config = {}) {
  const compressor = new AudioCompressor(config);
  return await compressor.compress(inputPath, outputPath);
}

/**
 * Convenience function to compress audio if needed
 */
export async function compressAudioIfNeeded(inputPath, outputPath = null, config = {}) {
  const compressor = new AudioCompressor(config);
  return await compressor.compressIfNeeded(inputPath, outputPath);
}

/**
 * Check if ffmpeg is available
 */
export async function checkFfmpegAvailable() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    
    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
    
    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Default export
 */
export default AudioCompressor;

