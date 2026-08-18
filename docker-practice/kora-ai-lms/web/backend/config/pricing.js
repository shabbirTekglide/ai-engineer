// Centralized pricing config; override with ENV if needed

export const TOKEN_PRICING_PER_1K = {
  // Defaults (adjust via env): values in USD per 1K tokens
  'gpt-4o-mini-2024-07-18': parseFloat(process.env.PRICE_GPT4O_MINI_PER_1K || '0.00015')
};

export const TOKEN_PRICING_OUTPUT_PER_1K = {
  // Some models have different output pricing; default to same as input if not specified
  'gpt-4o-mini-2024-07-18': parseFloat(process.env.PRICE_GPT4O_MINI_PER_1K || '0.0006')
};

export const TRANSCRIPTION_PRICING_PER_MIN = {
  // whisper-1 pricing per audio minute ($0.006/min = $0.36/hr)
  'whisper-1': parseFloat(process.env.PRICE_WHISPER1_PER_MIN || '0.006'),
  // Mistral voxtral-mini-latest pricing per audio minute
  'voxtral-mini-latest': parseFloat(process.env.PRICE_VOXTRAL_MINI_PER_MIN || '0.002'),
  // Modulate Velma-2 batch multilingual: $0.03/hr → $0.0005/min
  'velma-2-stt-batch': parseFloat(process.env.PRICE_VELMA2_STT_BATCH_PER_MIN || '0.0005')
};

export const TTS_PRICING_PER_1K_CHARS = {
  // tts models priced per 1K characters
  'tts-1': parseFloat(process.env.PRICE_TTS1_PER_1K_CHARS || '0.015')
};


