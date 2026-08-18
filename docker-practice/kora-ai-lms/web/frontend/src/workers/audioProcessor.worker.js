/**
 * DEPRECATED — This file is no longer used.
 *
 * The active worker lives at:  public/audioProcessorWorker.js
 *
 * It is loaded as a classic Worker (not a Vite module worker) so that
 * importScripts("lamejs.all.js") works correctly.  Vite's CJS→ESM
 * transform breaks lamejs internals (e.g. "MPEGMode is not defined").
 */
