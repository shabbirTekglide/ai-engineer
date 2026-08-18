/**
 * Client-side WAV to MP3 compression for large recordings.
 * Keeps uploads under nginx 250 MB limit by compressing 16-bit PCM WAV to MP3.
 *
 * Uses lamejs (Mp3Encoder + WavHeader) loaded via script (lamejs.all.js)
 * so internal refs (e.g. MPEGMode) are in scope. Loads from /lamejs.all.js
 * if not already on window (works at localhost and in production).
 */
let lamejsLoadPromise = null;

function loadLamejs() {
  if (typeof window === "undefined") return Promise.reject(new Error("window not available"));
  if (window.lamejs?.Mp3Encoder && window.lamejs?.WavHeader) return Promise.resolve(window.lamejs);
  if (lamejsLoadPromise) return lamejsLoadPromise;
  lamejsLoadPromise = new Promise((resolve, reject) => {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    const src = `${base}lamejs.all.js`;
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => {
      if (window.lamejs?.Mp3Encoder && window.lamejs?.WavHeader) resolve(window.lamejs);
      else reject(new Error("lamejs script loaded but Mp3Encoder/WavHeader missing"));
    };
    el.onerror = () => reject(new Error(`Failed to load ${src}. Check that public/lamejs.all.js exists.`));
    document.head.appendChild(el);
  });
  return lamejsLoadPromise;
}

function getLamejs() {
  if (typeof window !== "undefined" && window.lamejs?.Mp3Encoder && window.lamejs?.WavHeader) return window.lamejs;
  throw new Error("lamejs not loaded. Call loadLamejs() first or ensure /lamejs.all.js is in the page.");
}

const SAMPLE_BLOCK_SIZE = 1152; // multiple of 576 for encoder
const MP3_KBPS_SPEECH = 64; // 64 kbps sufficient for speech, ~8 KB/s

/**
 * Convert a WAV Blob to an MP3 Blob.
 *
 * @param {Blob} wavBlob - WAV file (16-bit PCM; standard 44-byte header or parsed via WavHeader)
 * @param {{ sampleRate?: number, numChannels?: number }} options - Override if known (e.g. our worker: 16000, 1)
 * @returns {Promise<Blob>} MP3 Blob (audio/mpeg)
 */
export async function wavToMp3(wavBlob, options = {}) {
  const lamejs = typeof window !== "undefined" && window.lamejs?.Mp3Encoder
    ? window.lamejs
    : await loadLamejs();

  const arrayBuffer = await wavBlob.arrayBuffer();
  const dataView = new DataView(arrayBuffer);

  let dataOffset = 44;
  let dataLen = arrayBuffer.byteLength - 44;
  let sampleRate = options.sampleRate ?? 16000;
  let numChannels = options.numChannels ?? 1;
  try {
    const wav = lamejs.WavHeader.readHeader(dataView);
    if (wav && wav.dataOffset != null && wav.dataLen != null) {
      dataOffset = wav.dataOffset;
      dataLen = wav.dataLen;
      if (wav.sampleRate != null) sampleRate = wav.sampleRate;
      if (wav.channels != null) numChannels = wav.channels;
    }
  } catch {
    // Fallback: assume our worker format (44-byte header, rest is 16-bit PCM)
  }

  const numSamples = dataLen / 2;
  const pcm = new Int16Array(arrayBuffer, dataOffset, numSamples);

  const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, MP3_KBPS_SPEECH);
  const mp3Chunks = [];

  for (let i = 0; i < pcm.length; i += SAMPLE_BLOCK_SIZE) {
    const chunk = pcm.subarray(i, i + SAMPLE_BLOCK_SIZE);
    const mp3Buf = mp3Encoder.encodeBuffer(chunk);
    if (mp3Buf.length > 0) mp3Chunks.push(mp3Buf);
  }

  const flush = mp3Encoder.flush();
  if (flush.length > 0) mp3Chunks.push(flush);

  return new Blob(mp3Chunks, { type: "audio/mpeg" });
}
