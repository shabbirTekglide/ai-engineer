/**
 * useAudioRecorder – Reliable long-duration lecture recording hook
 *
 * Architecture:
 *   AudioContext (16 kHz) → ScriptProcessorNode → Web Worker (real-time MP3)
 *
 * The worker uses lamejs to encode each PCM chunk to MP3 as it arrives,
 * so on stop the final blob is ready almost instantly (just a flush).
 *
 * File-size maths (64 kbps mono MP3):
 *   8 KB/s × 3 600 s = 28.8 MB per hour
 *   3 hours ≈ 86 MB — well under a 250 MB upload limit
 *
 * Why not MediaRecorder + WebM/Opus?
 *   WebM files from MediaRecorder have broken/missing duration metadata.
 *   Many cloud services (Cloudinary, etc.) report 0 s duration and return
 *   empty audio.  MP3 via ScriptProcessorNode avoids this entirely.
 */
import { useState, useRef, useCallback, useEffect } from "react";

// ── Constants ──────────────────────────────────────────────────────────
const SAMPLE_RATE = 16_000; // 16 kHz — optimal for speech
const BUFFER_SIZE = 4096; // ScriptProcessorNode buffer size
const MP3_KBPS = 64; // 64 kbps mono — excellent speech quality
const TIMER_INTERVAL_MS = 500; // UI timer refresh rate
const STOP_TIMEOUT_MS = 15_000; // generous timeout for flush

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState(null);
  const [wasBackgrounded, setWasBackgrounded] = useState(false);
  const [actualAudioDuration, setActualAudioDuration] = useState(null);

  // Audio refs
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const workerRef = useRef(null);

  // Pause ref (needs to be a ref so the onaudioprocess callback sees it)
  const isPausedRef = useRef(false);

  // Tracks whether we auto-paused due to page becoming hidden
  const autoPausedRef = useRef(false);
  const isRecordingRef = useRef(false);

  // Stop promise resolver
  const stopResolverRef = useRef(null);

  // Timer refs
  const timerRef = useRef(null);
  const startTsRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(0);

  // ── Timer helpers ──────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const seconds = Math.floor(
        (Date.now() - startTsRef.current - pausedMsRef.current) / 1000,
      );
      setElapsedTime(seconds);
    }, TIMER_INTERVAL_MS);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Cleanup helpers ────────────────────────────────────────────────
  const disconnectAudio = useCallback(() => {
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch { /* ok */ }
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* ok */ }
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ok */ }
      audioContextRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      disconnectAudio();
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "cancel" });
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-pause/resume on page visibility changes ──────────────────
  // Mobile browsers suspend AudioContext when the tab is hidden or the
  // screen turns off.  The timer (Date.now-based) would keep running,
  // creating a duration mismatch.  We auto-pause when hidden and
  // auto-resume + re-activate AudioContext when visible again.
  useEffect(() => {
    const handleVisibility = async () => {
      if (!isRecordingRef.current) return;

      if (document.visibilityState === "hidden" && !isPausedRef.current) {
        autoPausedRef.current = true;
        isPausedRef.current = true;
        pauseStartRef.current = Date.now();
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        console.log("[Recorder] Auto-paused (tab hidden / screen off)");
      } else if (document.visibilityState === "visible" && autoPausedRef.current) {
        autoPausedRef.current = false;
        setWasBackgrounded(true);

        const ctx = audioContextRef.current;
        if (ctx && ctx.state === "suspended") {
          try { await ctx.resume(); } catch { /* best-effort */ }
          console.log("[Recorder] AudioContext resumed, state:", ctx.state);
        }

        pausedMsRef.current += Date.now() - pauseStartRef.current;
        isPausedRef.current = false;
        startTimer();
        console.log("[Recorder] Auto-resumed (tab visible)");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [startTimer]);

  // ── Start recording ────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // 1. Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Create Web Worker for real-time MP3 encoding
      //    Worker lives in public/ and uses importScripts to load lamejs
      //    (avoids Vite's CJS→ESM transform which breaks lamejs internals)
      const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
      const worker = new Worker(`${base}audioProcessorWorker.js`);
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { type, blob, actualDurationSec, error: workerError } = e.data;
        if (type === "complete" && stopResolverRef.current) {
          if (actualDurationSec != null) setActualAudioDuration(actualDurationSec);
          stopResolverRef.current(blob);
          stopResolverRef.current = null;
        } else if (type === "error") {
          console.error("[AudioWorker] Error:", workerError);
          setError("Recording error: " + workerError);
          if (stopResolverRef.current) {
            stopResolverRef.current(null);
            stopResolverRef.current = null;
          }
        }
      };

      // 3. AudioContext at 16 kHz (optimal for speech)
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;

      const actualRate = audioContext.sampleRate;
      console.log(`[Recorder] AudioContext sample rate: ${actualRate} Hz`);

      // 4. Initialise the worker encoder
      worker.postMessage({
        type: "init",
        data: { sampleRate: actualRate, kbps: MP3_KBPS },
      });

      // 5. Wire up audio graph: mic → scriptProcessor → (worker)
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isPausedRef.current) return;
        const audioData = e.inputBuffer.getChannelData(0);
        // Send a copy to the worker (transfer is not needed for sliced arrays)
        worker.postMessage({
          type: "chunk",
          data: { audioData: audioData.slice() },
        });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // 6. Timer
      startTsRef.current = Date.now();
      pausedMsRef.current = 0;
      setElapsedTime(0);
      startTimer();

      // 7. State
      setIsRecording(true);
      isRecordingRef.current = true;
      setIsPaused(false);
      isPausedRef.current = false;
      autoPausedRef.current = false;
      setWasBackgrounded(false);
      setActualAudioDuration(null);

      const mbPerHr = ((MP3_KBPS * 1000) / 8 / 1024 / 1024) * 3600;
      console.log(
        `[Recorder] Started — ${actualRate} Hz, MP3 @ ${MP3_KBPS} kbps (≈${mbPerHr.toFixed(0)} MB/hr)`,
      );
    } catch (err) {
      console.error("[Recorder] Start error:", err);
      disconnectAudio();
      if (err?.name === "NotAllowedError") {
        setError("Microphone permission denied.");
      } else if (err?.name === "NotFoundError") {
        setError("No microphone found. Please connect a microphone.");
      } else {
        setError("Unable to access microphone.");
      }
    }
  }, [startTimer, disconnectAudio]);

  // ── Pause ──────────────────────────────────────────────────────────
  const pauseRecording = useCallback(() => {
    if (!isRecording || isPaused) return;
    isPausedRef.current = true;
    pauseStartRef.current = Date.now();
    stopTimer();
    setIsPaused(true);
    console.log("[Recorder] Paused");
  }, [isRecording, isPaused, stopTimer]);

  // ── Resume ─────────────────────────────────────────────────────────
  const resumeRecording = useCallback(() => {
    if (!isRecording || !isPaused) return;
    pausedMsRef.current += Date.now() - pauseStartRef.current;
    isPausedRef.current = false;
    startTimer();
    setIsPaused(false);
    console.log("[Recorder] Resumed");
  }, [isRecording, isPaused, startTimer]);

  // ── Stop → returns MP3 Blob ────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!workerRef.current) return null;

    setIsRecording(false);
    isRecordingRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    autoPausedRef.current = false;
    setIsStopping(true);
    stopTimer();

    // Disconnect audio immediately (releases microphone)
    disconnectAudio();

    try {
      const blob = await new Promise((resolve, reject) => {
        stopResolverRef.current = resolve;

        const timeout = setTimeout(() => {
          stopResolverRef.current = null;
          reject(new Error("Stop recording timeout"));
        }, STOP_TIMEOUT_MS);

        const originalResolver = stopResolverRef.current;
        stopResolverRef.current = (result) => {
          clearTimeout(timeout);
          originalResolver(result);
        };

        workerRef.current.postMessage({ type: "stop" });
      });

      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      if (blob) {
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        console.log(`[Recorder] Stopped — ${sizeMB} MB MP3`);
      }

      setIsStopping(false);
      return blob;
    } catch (err) {
      console.error("[Recorder] Stop error:", err);
      setError("Failed to process recording. Please try again.");
      setIsStopping(false);

      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      return null;
    }
  }, [stopTimer, disconnectAudio]);

  // ── Cancel (discard) ───────────────────────────────────────────────
  const cancelRecording = useCallback(() => {
    stopTimer();
    disconnectAudio();

    if (workerRef.current) {
      workerRef.current.postMessage({ type: "cancel" });
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setIsRecording(false);
    isRecordingRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    autoPausedRef.current = false;
    setIsStopping(false);
    setElapsedTime(0);
    setError(null);
    setWasBackgrounded(false);
    setActualAudioDuration(null);

    console.log("[Recorder] Cancelled");
  }, [stopTimer, disconnectAudio]);

  // ── Public API ─────────────────────────────────────────────────────
  return {
    // State
    isRecording,
    isPaused,
    isStopping,
    elapsedTime,
    error,
    wasBackgrounded,
    actualAudioDuration,

    // Actions
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
  };
};
