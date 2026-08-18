/**
 * Transcription Configuration
 * ==========================
 * 
 * Centralized configuration for the transcription service
 * Includes all settings, models, and optimization parameters
 */

import { TranscriptionConfig } from '../services/openaiTranscriptionService.js';

// OpenAI API Configuration
export const OPENAI_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  timeout: 30 * 60 * 1000, // 30 minutes timeout for API requests (1,800,000 ms)
  maxRetries: 3,
  retryDelay: 1000
};

// Mistral AI Configuration
export const MISTRAL_CONFIG = {
  apiKey: process.env.MISTRAL_API_KEY,
  baseURL: 'https://api.mistral.ai/v1/audio/transcriptions',
  timeout: 30 * 60 * 1000, // 30 minutes timeout for API requests
  maxRetries: 3,
  retryDelay: 1000,
  model: 'voxtral-mini-latest',
  chunkDurationSeconds: 720, // 12 minutes - stays under 16K token limit
  maxTokenLimit: 16384 // Reference for future optimization
};

// Modulate Velma-2 Configuration (multilingual batch STT)
// Endpoint accepts files up to 100MB and uses the `X-API-Key` header.
// Pricing reference: $0.03 / hour of audio processed (as of 2026).
export const VELMA_CONFIG = {
  apiKey: process.env.VELMA_API_KEY,
  baseURL: 'https://modulate-developer-apis.com/api/velma-2-stt-batch',
  timeout: 30 * 60 * 1000, // 30 minutes per chunk
  maxRetries: 3,
  retryDelay: 1000,
  model: 'velma-2-stt-batch',
  // 20-minute chunks keep each upload well under the 100MB cap while
  // allowing parallelism and granular progress reporting.
  chunkDurationSeconds: 1200,
  maxFileSizeBytes: 100 * 1024 * 1024,
  // Enrichment flags forwarded to the API.
  enrichment: {
    speakerDiarization: true,
    emotionSignal: false,
    accentSignal: false,
    piiPhiTagging: false
  }
};

// Active transcription provider ('openai' | 'mistral' | 'velma')
// Default kept on 'mistral' for backwards compatibility. Set
// ACTIVE_TRANSCRIPTION_PROVIDER (or legacy TRANSCRIPTION_PROVIDER) to
// 'velma' / 'openai' in the environment (or via the admin dashboard once
// wired through Config) to swap the active STT provider. Both env vars
// are accepted to keep parity with bullmq workers that read the
// ACTIVE_TRANSCRIPTION_PROVIDER name.
export const ACTIVE_TRANSCRIPTION_PROVIDER =
  process.env.ACTIVE_TRANSCRIPTION_PROVIDER ||
  process.env.TRANSCRIPTION_PROVIDER ||
  'mistral';

// Model configurations with performance characteristics
export const MODEL_CONFIGS = {
  'whisper-1': {
    name: 'whisper-1',
    provider: 'openai',
    maxFileSize: 25 * 1024 * 1024, // 25MB
    supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
    quality: 'high',
    speed: 'medium',
    cost: 'standard',
    chunkDuration: 600 // 10 minutes
  },
  'voxtral-mini-latest': {
    name: 'voxtral-mini-latest',
    provider: 'mistral',
    maxFileSize: 25 * 1024 * 1024, // 25MB
    supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
    quality: 'high',
    speed: 'fast',
    cost: 'economical',
    chunkDuration: 720, // 12 minutes - optimized for 16K token limit
    maxTokenLimit: 16384
  },
  'velma-2-stt-batch': {
    name: 'velma-2-stt-batch',
    provider: 'velma',
    maxFileSize: 100 * 1024 * 1024, // 100MB per API documentation
    supportedFormats: ['aac', 'aiff', 'flac', 'mp3', 'mp4', 'mov', 'ogg', 'opus', 'wav', 'webm'],
    // 70+ languages with automatic detection per utterance.
    languages: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
      'ar', 'hi', 'nl', 'sv', 'no', 'da', 'fi', 'tr', 'pl', 'cs',
      'uk', 'he', 'vi', 'th', 'id', 'ms', 'ro', 'el', 'hu', 'bg'
    ],
    quality: 'high',           // Industry-leading WER on conversational audio
    speed: 'fast',             // Batch English-VFast variant is >200x real-time
    cost: 'economical',        // $0.03 / hour
    chunkDuration: 1200,       // 20 minutes (safe well under 100MB)
    features: {
      speakerDiarization: true,
      emotionDetection: true,
      accentDetection: true,
      piiPhiTagging: true,
      autoCapitalization: true,
      autoPunctuation: true,
      automaticLanguageDetection: true
    }
  }
};

// Quality thresholds for dynamic optimization
export const QUALITY_THRESHOLDS = {
  excellent: { 
    confidence: 0.9, 
    lengthRatio: 0.8,
    wordCount: 100,
    description: 'High confidence, comprehensive transcription'
  },
  good: { 
    confidence: 0.8, 
    lengthRatio: 0.6,
    wordCount: 50,
    description: 'Good confidence, adequate transcription'
  },
  fair: { 
    confidence: 0.7, 
    lengthRatio: 0.4,
    wordCount: 25,
    description: 'Acceptable confidence, basic transcription'
  },
  poor: { 
    confidence: 0.6, 
    lengthRatio: 0.2,
    wordCount: 10,
    description: 'Low confidence, minimal transcription'
  }
};

// Audio processing configuration
export const AUDIO_CONFIG = {
  maxFileSize: 25 * 1024 * 1024, // 25MB (API limit)
  maxDuration: 25 * 60, // 25 minutes (OpenAI limit - Mistral can handle longer)
  supportedFormats: [
    'audio/mpeg',      // MP3
    'audio/wav',       // WAV
    'audio/ogg',       // OGG
    'audio/aac',       // AAC
    'audio/flac',      // FLAC
    'audio/webm',      // WebM audio
    'audio/x-m4a',     // M4A
    'audio/mp4',       // MP4 audio
    'audio/x-ms-wma'   // WMA
  ],
  preferredFormat: {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    format: 'wav'
  },
  chunking: {
    openai: {
      defaultChunkSize: 300, // 5 minutes
      maxChunkSize: 600, // 10 minutes
      minChunkSize: 60, // 1 minute
      overlapSeconds: 5,
      maxConcurrentChunks: 3
    },
    mistral: {
      defaultChunkSize: 720, // 12 minutes (optimized for 16K token limit)
      maxChunkSize: 720, // 12 minutes max
      minChunkSize: 60, // 1 minute
      overlapSeconds: 0, // No overlap for clean concatenation
      maxConcurrentChunks: 3
    },
    velma: {
      defaultChunkSize: 1200, // 20 minutes (Velma allows 100MB per file)
      maxChunkSize: 1800, // 30 minutes hard cap
      minChunkSize: 60, // 1 minute
      overlapSeconds: 0, // No overlap for clean concatenation
      // Velma enforces a concurrent-request cap (429); keep low to avoid stalls.
      maxConcurrentChunks: parseInt(process.env.VELMA_MAX_CONCURRENT_CHUNKS, 10) || 1
    }
  }
};

// Performance optimization settings
export const PERFORMANCE_CONFIG = {
  concurrency: {
    maxConcurrentRequests: 3,
    maxConcurrentChunks: 3,
    queueTimeout: 0 // No timeout - processes can take as long as needed
  },
  caching: {
    enableTranscriptCache: true,
    cacheExpiry: 24 * 60 * 60 * 1000, // 24 hours
    maxCacheSize: 100 // Maximum number of cached transcripts
  },
  rateLimiting: {
    requestsPerMinute: 5,
    requestsPerHour: 100,
    burstLimit: 10
  }
};

// Error handling and retry configuration
export const ERROR_CONFIG = {
  retry: {
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    backoffMultiplier: 2,
    maxRetryDelay: 10000 // 10 seconds
  },
  timeouts: {
    transcription: 30 * 60 * 1000, // 30 minutes timeout for transcription requests
    notes: 0, // No timeout - can take as long as needed
    quiz: 0, // No timeout - can take as long as needed
    flashcards: 0 // No timeout - can take as long as needed
  },
  fallback: {
    enableFallbackNotes: true,
    enableFallbackQuiz: false,
    enableFallbackFlashcards: false
  }
};

// Default transcription configurations for different use cases
export const DEFAULT_CONFIGS = {
  // Fast transcription - prioritizes speed
  fast: new TranscriptionConfig({
    model: 'whisper-1',
    language: 'en',
    responseFormat: 'text',
    temperature: 0.0,
    qualityThreshold: 'good',
    enableTimestamp: false,
    enableRealTimeProgress: true,
    maxConcurrentChunks: 5,
    chunkOverlapSeconds: 2,
    enableRetry: false
  }),

  // Balanced transcription - good balance of speed and quality
  balanced: new TranscriptionConfig({
    model: 'whisper-1',
    language: 'en',
    responseFormat: 'verbose_json',
    temperature: 0.0,
    qualityThreshold: 'good',
    enableTimestamp: true,
    enableRealTimeProgress: true,
    maxConcurrentChunks: 3,
    chunkOverlapSeconds: 5,
    enableRetry: true,
    maxRetries: 2
  }),

  // High quality transcription - prioritizes accuracy
  highQuality: new TranscriptionConfig({
    model: 'whisper-1',
    language: 'en',
    responseFormat: 'verbose_json',
    temperature: 0.0,
    qualityThreshold: 'excellent',
    enableTimestamp: true,
    enableSpeakerDetection: false,
    enableRealTimeProgress: true,
    maxConcurrentChunks: 2,
    chunkOverlapSeconds: 10,
    enableRetry: true,
    maxRetries: 3
  }),

  // Lecture transcription - optimized for educational content
  lecture: new TranscriptionConfig({
    model: 'whisper-1',
    language: 'en',
    responseFormat: 'verbose_json',
    temperature: 0.0,
    qualityThreshold: 'good',
    enableTimestamp: true,
    enableRealTimeProgress: true,
    maxConcurrentChunks: 3,
    chunkOverlapSeconds: 5,
    enableRetry: true,
    maxRetries: 3,
    prompt: 'This is an educational lecture. Please transcribe accurately with proper punctuation, capitalization, and formatting. Pay special attention to technical terms and concepts.'
  }),

  // Mistral transcription - optimized for 12-minute chunks with 16K token limit
  mistral: {
    model: 'voxtral-mini-latest',
    language: 'en',
    responseFormat: 'json',
    temperature: 0.0,
    enableTimestamp: true,
    enableRealTimeProgress: true,
    maxConcurrentChunks: 3,
    chunkDurationSeconds: 720, // 12 minutes
    chunkOverlapSeconds: 0,
    enableRetry: true,
    maxRetries: 3,
    prompt: 'This is an educational lecture. Please transcribe accurately with proper punctuation, capitalization, and formatting. Pay special attention to technical terms and concepts.'
  },

  // Velma-2 transcription - 20-minute chunks under the 100MB per-request cap.
  // Velma always returns JSON with utterance-level timestamps + automatic
  // capitalization & punctuation, so prompt/temperature are ignored by the API.
  velma: {
    model: 'velma-2-stt-batch',
    language: null, // null = auto-detect (Velma multilingual)
    responseFormat: 'json',
    enableTimestamp: true,
    enableRealTimeProgress: true,
    maxConcurrentChunks: 3,
    chunkDurationSeconds: 1200, // 20 minutes
    chunkOverlapSeconds: 0,
    enableRetry: true,
    maxRetries: 3,
    // Enrichment toggles forwarded to Velma as multipart form fields.
    speakerDiarization: true,
    emotionSignal: false,
    accentSignal: false,
    piiPhiTagging: false
  }
};

// AI content generation prompts
export const AI_PROMPTS = {
  notes: {
    system: 'You are an expert educational content creator. Create comprehensive, well-structured lecture notes that help students understand and retain the material.',
    user: (title) => `Please create comprehensive lecture notes from the following transcript of a lecture titled "${title}". 

Format the notes as structured markdown with:
1. A clear overview section
2. Main topics and key concepts
3. Important details and examples
4. Key takeaways
5. Study prompts for review

Please make the notes educational, well-organized, and suitable for studying.`
  },

  quiz: {
    system: 'You are an expert educator creating assessment materials. Generate thoughtful, educational quiz questions that test real understanding.',
    user: (title) => `Create a quiz based on the following lecture notes from "${title}". 

Generate 5-10 multiple choice questions that test understanding of the key concepts. For each question:
- Provide 4 answer options
- Mark the correct answer (0-indexed)
- Include a brief explanation
- Add a helpful hint

Format as JSON:
{
  "title": "Quiz Title",
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Why this answer is correct",
      "hint": "Helpful hint for students"
    }
  ]
}`
  },

  flashcards: {
    system: 'You are an expert educator creating study materials. Generate effective flashcards that help students memorize and understand key concepts.',
    user: (title) => `Create flashcards based on the following lecture notes from "${title}". 

Generate 8-12 flashcards that cover the most important concepts. For each flashcard:
- Create a clear, concise term or concept
- Provide a detailed definition or explanation
- Include a helpful hint for memorization

Format as JSON:
{
  "title": "Flashcard Set Title",
  "flashcards": [
    {
      "term": "Term or concept",
      "definition": "Detailed explanation",
      "hint": "Memorization hint"
    }
  ]
}`
  }
};

// Validation schemas
export const VALIDATION_SCHEMAS = {
  audioFile: {
    maxSize: 25 * 1024 * 1024, // 25MB
    allowedTypes: AUDIO_CONFIG.supportedFormats,
    allowedExtensions: ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.webm', '.m4a', '.mp4', '.wma']
  },
  transcription: {
    maxDuration: 25 * 60, // 25 minutes
    minDuration: 1, // 1 second
    supportedLanguages: MODEL_CONFIGS['whisper-1'].languages
  }
};

// Logging configuration
export const LOGGING_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
  enableConsoleLogging: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
  logFile: process.env.LOG_FILE || 'transcription.log',
  maxLogSize: 10 * 1024 * 1024, // 10MB
  maxLogFiles: 5
};

// Monitoring and metrics configuration
export const MONITORING_CONFIG = {
  enableMetrics: process.env.ENABLE_METRICS === 'true',
  metricsInterval: 60000, // 1 minute
  healthCheckInterval: 30000, // 30 seconds
  alertThresholds: {
    errorRate: 0.05, // 5%
    responseTime: 300000, // 5 minutes
    queueLength: 10
  }
};

// Export configuration getter functions
export function getConfigForUseCase(useCase = 'balanced') {
  return DEFAULT_CONFIGS[useCase] || DEFAULT_CONFIGS.balanced;
}

export function getConfigForAudioAnalysis(analysis) {
  const baseConfig = DEFAULT_CONFIGS.balanced;
  
  // Adjust based on audio characteristics
  if (analysis.estimatedComplexity === 'high') {
    baseConfig.maxConcurrentChunks = 2;
    baseConfig.qualityThreshold = 'excellent';
    baseConfig.chunkOverlapSeconds = 10;
  } else if (analysis.estimatedComplexity === 'low') {
    baseConfig.maxConcurrentChunks = 5;
    baseConfig.qualityThreshold = 'good';
    baseConfig.chunkOverlapSeconds = 2;
  }

  // Adjust based on duration
  if (analysis.duration > 3600) { // > 1 hour
    baseConfig.chunkOverlapSeconds = 10;
    baseConfig.maxConcurrentChunks = 2;
  }

  return baseConfig;
}

export function getOptimalChunkSize(duration, complexity) {
  if (complexity === 'high') return 180; // 3 minutes
  if (complexity === 'medium') return 300; // 5 minutes
  if (duration > 3600) return 420; // 7 minutes for very long audio
  return 300; // Default 5 minutes
}

export default {
  OPENAI_CONFIG,
  MISTRAL_CONFIG,
  VELMA_CONFIG,
  ACTIVE_TRANSCRIPTION_PROVIDER,
  MODEL_CONFIGS,
  QUALITY_THRESHOLDS,
  AUDIO_CONFIG,
  PERFORMANCE_CONFIG,
  ERROR_CONFIG,
  DEFAULT_CONFIGS,
  AI_PROMPTS,
  VALIDATION_SCHEMAS,
  LOGGING_CONFIG,
  MONITORING_CONFIG,
  getConfigForUseCase,
  getConfigForAudioAnalysis,
  getOptimalChunkSize
};
