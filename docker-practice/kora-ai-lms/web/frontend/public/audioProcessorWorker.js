/**
 * Audio Processor Web Worker — Real-time MP3 Encoding (Classic Worker)
 *
 * Uses importScripts to load lamejs from the public folder.
 * This avoids Vite's CJS→ESM transform which breaks lamejs internals
 * (e.g. "MPEGMode is not defined").
 *
 * Receives raw Float32 PCM chunks from the main thread (via ScriptProcessorNode),
 * converts them to 16-bit PCM, and feeds them to a lamejs Mp3Encoder in real-time.
 *
 * File-size maths (64 kbps mono):
 *   8 KB/s × 3 600 s = 28.8 MB per hour
 *   3 hours ≈ 86 MB — well under a 250 MB upload limit
 */

/* global lamejs */
self.importScripts("lamejs.all.js");

var mp3Encoder = null;
var mp3Chunks = [];
var totalSamples = 0;
var encoderSampleRate = 16000;

/**
 * Convert Float32 audio samples (range -1…1) to Int16 PCM.
 */
function floatTo16BitPCM(float32) {
  var len = float32.length;
  var pcm = new Int16Array(len);
  for (var i = 0; i < len; i++) {
    var s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

self.onmessage = function (e) {
  var type = e.data.type;
  var data = e.data.data;

  switch (type) {
    // ── Initialise encoder ──────────────────────────────────────────
    case "init": {
      var sampleRate = (data && data.sampleRate) || 16000;
      var kbps = (data && data.kbps) || 64;
      try {
        mp3Encoder = new lamejs.Mp3Encoder(1, sampleRate, kbps);
        mp3Chunks = [];
        totalSamples = 0;
        encoderSampleRate = sampleRate;
        self.postMessage({ type: "ready" });
      } catch (err) {
        self.postMessage({
          type: "error",
          error: "Failed to initialise MP3 encoder: " + err.message,
        });
      }
      break;
    }

    // ── Encode a PCM chunk ──────────────────────────────────────────
    case "chunk": {
      if (!mp3Encoder) return;
      try {
        var pcm = floatTo16BitPCM(data.audioData);
        totalSamples += pcm.length;
        var mp3buf = mp3Encoder.encodeBuffer(pcm);
        if (mp3buf.length > 0) {
          mp3Chunks.push(mp3buf);
        }
      } catch (err) {
        console.error("[Worker] Encode error:", err);
      }
      break;
    }

    // ── Finish & return blob ────────────────────────────────────────
    case "stop": {
      if (!mp3Encoder) {
        self.postMessage({ type: "error", error: "No encoder initialised" });
        return;
      }
      try {
        var flush = mp3Encoder.flush();
        if (flush.length > 0) mp3Chunks.push(flush);

        var blob = new Blob(mp3Chunks, { type: "audio/mpeg" });
        var actualDurationSec = encoderSampleRate > 0
          ? Math.round(totalSamples / encoderSampleRate)
          : 0;
        mp3Chunks = [];
        mp3Encoder = null;
        totalSamples = 0;
        self.postMessage({ type: "complete", blob: blob, actualDurationSec: actualDurationSec });
      } catch (err) {
        self.postMessage({
          type: "error",
          error: "Failed to finalise MP3: " + err.message,
        });
      }
      break;
    }

    // ── Cancel (discard) ────────────────────────────────────────────
    case "cancel": {
      mp3Chunks = [];
      mp3Encoder = null;
      self.postMessage({ type: "cancelled" });
      break;
    }

    default:
      break;
  }
};
