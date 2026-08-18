/**
 * Transcription Middleware
 * =======================
 * 
 * Middleware for transcription-specific validation and error handling
 * Provides comprehensive validation for audio files and transcription requests
 */

import multer from 'multer';
import { z } from 'zod';

// Audio file validation schema
const AudioFileSchema = z.object({
  mimetype: z.string().refine(
    (type) => [
      'audio/mpeg',      // MP3
      'audio/wav',       // WAV
      'audio/ogg',       // OGG
      'audio/aac',       // AAC
      'audio/flac',      // FLAC
      'audio/webm',      // WebM audio
      'audio/x-m4a',     // M4A
      'audio/mp4',       // MP4 audio
      'audio/x-ms-wma'   // WMA
    ].includes(type),
    { message: 'Invalid audio format. Supported formats: MP3, WAV, OGG, AAC, FLAC, WebM, M4A, MP4, WMA' }
  ),
  size: z.number().max(
    100 * 1024 * 1024, // 25MB limit (OpenAI's limit)
    { message: 'Audio file too large. Maximum size is 100MB.' }
  ),
  originalname: z.string().min(1, { message: 'File name is required' })
});

// Transcription configuration schema
const TranscriptionConfigSchema = z.object({
  model: z.string().default('whisper-1'),
  language: z.string().default('en'),
  responseFormat: z.enum(['json', 'text', 'srt', 'verbose_json', 'vtt']).default('verbose_json'),
  temperature: z.number().min(0).max(1).default(0.0),
  prompt: z.string().optional(),
  qualityThreshold: z.enum(['excellent', 'good', 'fair', 'poor']).default('good'),
  enableTimestamp: z.boolean().default(true),
  enableSpeakerDetection: z.boolean().default(false),
  maxConcurrentChunks: z.number().min(1).max(10).default(1),
  chunkOverlapSeconds: z.number().min(0).max(60).default(5),
  enableRealTimeProgress: z.boolean().default(true),
  enableRetry: z.boolean().default(true),
  maxRetries: z.number().min(1).max(5).default(3)
});

/**
 * Validate audio file
 */
export const validateAudioFile = (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is required',
        errors: ['No audio file provided']
      });
    }

    const validationResult = AudioFileSchema.safeParse({
      mimetype: req.file.mimetype,
      size: req.file.size,
      originalname: req.file.originalname
    });

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid audio file',
        errors
      });
    }

    // Additional validation: check file extension
    const allowedExtensions = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.webm', '.m4a', '.mp4', '.wma'];
    const fileExtension = req.file.originalname.toLowerCase().substring(req.file.originalname.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file extension',
        errors: [`File extension ${fileExtension} is not supported`]
      });
    }

    next();
  } catch (error) {
    console.error('Audio file validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'File validation error',
      error: error.message
    });
  }
};

/**
 * Validate transcription configuration
 */
export const validateTranscriptionConfig = (req, res, next) => {
  try {
    const configData = req.body.config || {};
    
    const validationResult = TranscriptionConfigSchema.safeParse(configData);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid transcription configuration',
        errors
      });
    }

    // Attach validated config to request
    req.transcriptionConfig = validationResult.data;
    next();
  } catch (error) {
    console.error('Transcription config validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Configuration validation error',
      error: error.message
    });
  }
};

/**
 * Enhanced audio upload middleware with better error handling
 */
export const createAudioUploadMiddleware = (options = {}) => {
  const defaultOptions = {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB
      files: 1
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 
        'audio/flac', 'audio/webm', 'audio/x-m4a', 'audio/mp4', 'audio/x-ms-wma'
      ];
      
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid audio format: ${file.mimetype}. Supported formats: MP3, WAV, OGG, AAC, FLAC, WebM, M4A, MP4, WMA`), false);
      }
    },
    ...options
  };

  const upload = multer({
    storage: multer.memoryStorage(),
    ...defaultOptions
  });

  return (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              message: 'File too large',
              error: 'Audio file exceeds 25MB limit'
            });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
              success: false,
              message: 'Too many files',
              error: 'Only one audio file is allowed'
            });
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
              success: false,
              message: 'Unexpected file field',
              error: 'Audio file must be uploaded with field name "audio"'
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }
      next();
    });
  };
};

/**
 * Error handling middleware for transcription operations
 */
export const transcriptionErrorHandler = (error, req, res, next) => {
  console.error('Transcription error:', error);

  // OpenAI API errors
  if (error.type === 'invalid_request_error') {
    return res.status(400).json({
      success: false,
      message: 'Invalid transcription request',
      error: error.message,
      type: 'INVALID_REQUEST'
    });
  }

  if (error.type === 'rate_limit_error') {
    return res.status(429).json({
      success: false,
      message: 'Rate limit exceeded',
      error: 'Too many transcription requests. Please try again later.',
      type: 'RATE_LIMIT',
      retryAfter: error.headers?.['retry-after']
    });
  }

  if (error.type === 'insufficient_quota') {
    return res.status(402).json({
      success: false,
      message: 'Insufficient quota',
      error: 'OpenAI API quota exceeded. Please check your billing.',
      type: 'QUOTA_EXCEEDED'
    });
  }

  // File processing errors
  if (error.code === 'ENOENT') {
    return res.status(404).json({
      success: false,
      message: 'File not found',
      error: 'The requested audio file could not be found.',
      type: 'FILE_NOT_FOUND'
    });
  }

  if (error.code === 'EACCES') {
    return res.status(403).json({
      success: false,
      message: 'Permission denied',
      error: 'Insufficient permissions to access the audio file.',
      type: 'PERMISSION_DENIED'
    });
  }

  // Audio processing errors
  if (error.message.includes('ffmpeg') || error.message.includes('ffprobe')) {
    return res.status(500).json({
      success: false,
      message: 'Audio processing error',
      error: 'Audio processing tools not available. Please contact support.',
      type: 'AUDIO_PROCESSING_ERROR'
    });
  }

  // Default error response
  return res.status(500).json({
    success: false,
    message: 'Transcription processing error',
    error: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred during transcription.' 
      : error.message,
    type: 'INTERNAL_ERROR'
  });
};

/**
 * Rate limiting middleware for transcription requests
 */
export const transcriptionRateLimit = (() => {
  const requests = new Map();
  const WINDOW_MS = 60 * 1000; // 1 minute
  const MAX_REQUESTS = 5; // 5 requests per minute per user

  return (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) {
      return next();
    }

    const now = Date.now();
    const userRequests = requests.get(userId) || [];

    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => now - time < WINDOW_MS);

    if (validRequests.length >= MAX_REQUESTS) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
        error: `Too many transcription requests. Maximum ${MAX_REQUESTS} requests per minute allowed.`,
        type: 'RATE_LIMIT',
        retryAfter: Math.ceil(WINDOW_MS / 1000)
      });
    }

    // Add current request
    validRequests.push(now);
    requests.set(userId, validRequests);

    next();
  };
})();

/**
 * Validate OpenAI API key middleware
 */
export const validateOpenAIKey = (req, res, next) => {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: 'Service configuration error',
      error: 'OpenAI API key not configured',
      type: 'CONFIGURATION_ERROR'
    });
  }

  if (!apiKey.startsWith('sk-')) {
    return res.status(500).json({
      success: false,
      message: 'Service configuration error',
      error: 'Invalid OpenAI API key format',
      type: 'CONFIGURATION_ERROR'
    });
  }

  next();
};

export default {
  validateAudioFile,
  validateTranscriptionConfig,
  createAudioUploadMiddleware,
  transcriptionErrorHandler,
  transcriptionRateLimit,
  validateOpenAIKey
};
