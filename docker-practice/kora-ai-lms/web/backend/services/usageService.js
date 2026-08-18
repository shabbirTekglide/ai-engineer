import { spawn } from 'child_process';
import UsageLog from '../models/usageLog.js';
import {
  TOKEN_PRICING_PER_1K,
  TOKEN_PRICING_OUTPUT_PER_1K,
  TRANSCRIPTION_PRICING_PER_MIN,
  TTS_PRICING_PER_1K_CHARS
} from '../config/pricing.js';
import User from '../models/User.js';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function estimateChatCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const inputRate = TOKEN_PRICING_PER_1K[model] ?? TOKEN_PRICING_PER_1K['gpt-4o-mini-2024-07-18'] ?? 0;
  const outputRate = (TOKEN_PRICING_OUTPUT_PER_1K[model] ?? inputRate);
  const inputCost = (toNumber(inputTokens) / 1000) * inputRate;
  const outputCost = (toNumber(outputTokens) / 1000) * outputRate;
  return +(inputCost + outputCost).toFixed(6);
}

export function estimateTranscriptionCostUsd(model, audioSeconds = 0) {
  const perMin = TRANSCRIPTION_PRICING_PER_MIN[model] ?? TRANSCRIPTION_PRICING_PER_MIN['whisper-1'] ?? 0;
  const minutes = toNumber(audioSeconds) / 60;
  return +(minutes * perMin).toFixed(6);
}

export function estimateTTSCostUsd(model, characters = 0) {
  const per1k = TTS_PRICING_PER_1K_CHARS[model] ?? TTS_PRICING_PER_1K_CHARS['tts-1'] ?? 0;
  return +((toNumber(characters) / 1000) * per1k).toFixed(6);
}

export async function probeAudioDurationSeconds(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ]);

    let stdout = '';
    ffprobe.stdout.on('data', d => stdout += d.toString());
    ffprobe.on('close', () => {
      try {
        const info = JSON.parse(stdout || '{}');
        const duration = parseFloat(info?.format?.duration) || 0;
        resolve(duration);
      } catch {
        resolve(0);
      }
    });
    ffprobe.on('error', () => resolve(0));
  });
}

export async function recordChatCompletionUsage({ userId, service, model, usage, metadata }) {
  const inputTokens = toNumber(usage?.prompt_tokens || usage?.promptTokens || 0);
  const outputTokens = toNumber(usage?.completion_tokens || usage?.completionTokens || 0);
  const totalTokens = toNumber(usage?.total_tokens || usage?.totalTokens || (inputTokens + outputTokens));
  const costUsd = estimateChatCostUsd(model, inputTokens, outputTokens);
  const user = await User.findById(userId);
  const subscriptionId = user.subscription._id;
  await UsageLog.create({
    userId,
    subscriptionId,
    service,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    metadata
  });
}

export async function recordTranscriptionUsage({ userId, service, model, audioSeconds = 0, metadata }) {
  const costUsd = estimateTranscriptionCostUsd(model, audioSeconds);
  const user = await User.findById(userId);
  const subscriptionId = user.subscription._id;
  await UsageLog.create({
    userId,
    subscriptionId,
    service,
    model,
    audioSeconds,
    costUsd,
    metadata
  });
}

export async function recordTTSUsage({ userId, service, model, characters = 0, metadata }) {
  const costUsd = estimateTTSCostUsd(model, characters);
  const user = await User.findById(userId);
  const subscriptionId = user.subscription._id;
  await UsageLog.create({
    userId,
    subscriptionId,
    service,
    model,
    characters,
    costUsd,
    metadata
  });
}


