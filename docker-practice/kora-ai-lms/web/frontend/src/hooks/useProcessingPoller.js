import { useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { pollLectureStatuses } from "../store/slicers/lectureSlice";

/**
 * useProcessingPoller
 * ===================
 *
 * Smart polling hook that automatically tracks the processing status
 * of lectures that are in non-terminal states (pending / processing).
 *
 * Why polling instead of SSE?
 * - EventSource cannot send Authorization headers
 * - Reverse proxies (Nginx, Cloudflare, AWS ALB) kill idle SSE connections
 * - SSE reconnection is unreliable across browsers
 * - Polling with the authenticated axios instance works everywhere
 *
 * Features:
 * - Polls every `interval` ms while there are active lectures
 * - Exponential backoff on consecutive errors (up to 30s)
 * - Resets backoff on successful polls
 * - Automatically stops when all lectures reach terminal states
 * - Cleans up on unmount
 * - Does NOT set loading states (so the UI doesn't flash)
 *
 * @param {Object} options
 * @param {number} options.interval - Base poll interval in ms (default: 5000)
 * @param {number} options.maxInterval - Max backoff interval in ms (default: 30000)
 * @param {boolean} options.enabled - Whether polling is enabled (default: true)
 */
export function useProcessingPoller({
  interval = 5000,
  maxInterval = 30000,
  enabled = true,
} = {}) {
  const dispatch = useDispatch();
  const lectures = useSelector((state) => state.lecture.lectures);
  const hasActiveProcessing = useSelector((state) => state.lecture.hasActiveProcessing);

  const timerRef = useRef(null);
  const consecutiveErrorsRef = useRef(0);
  const isMountedRef = useRef(true);
  const isPollingRef = useRef(false);

  /**
   * Compute which lecture IDs need status polling
   */
  const getActiveLectureIds = useCallback(() => {
    if (!lectures || lectures.length === 0) return [];
    return lectures
      .filter(
        (l) =>
          l.processingStatus === "pending" || l.processingStatus === "processing"
      )
      .map((l) => l._id);
  }, [lectures]);

  /**
   * Execute one poll cycle
   */
  const poll = useCallback(async () => {
    if (!isMountedRef.current || isPollingRef.current) return;

    const activeIds = getActiveLectureIds();
    if (activeIds.length === 0) return;

    isPollingRef.current = true;

    try {
      const result = await dispatch(pollLectureStatuses(activeIds)).unwrap();

      if (result?.statuses && isMountedRef.current) {
        consecutiveErrorsRef.current = 0; // reset backoff on success
      }
    } catch {
      // Network error — increase backoff
      consecutiveErrorsRef.current = Math.min(consecutiveErrorsRef.current + 1, 5);
    } finally {
      isPollingRef.current = false;
    }
  }, [dispatch, getActiveLectureIds]);

  /**
   * Schedule next poll with exponential backoff on errors
   */
  const scheduleNext = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isMountedRef.current || !enabled) return;

    const activeIds = getActiveLectureIds();
    if (activeIds.length === 0) return;

    // Exponential backoff: interval * 2^errors, capped at maxInterval
    const backoff = Math.min(
      interval * Math.pow(2, consecutiveErrorsRef.current),
      maxInterval
    );

    timerRef.current = setTimeout(async () => {
      await poll();
      if (isMountedRef.current) {
        scheduleNext();
      }
    }, backoff);
  }, [enabled, interval, maxInterval, getActiveLectureIds, poll]);

  /**
   * Main effect — start/stop polling based on active lectures
   */
  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled || !hasActiveProcessing) {
      // No active lectures — clear any running timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Kick off an immediate poll, then schedule the next one
    poll().then(() => {
      if (isMountedRef.current) {
        scheduleNext();
      }
    });

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, hasActiveProcessing, poll, scheduleNext]);

  /**
   * Manual trigger — lets components request an immediate poll
   */
  const pollNow = useCallback(() => {
    consecutiveErrorsRef.current = 0;
    poll().then(() => {
      if (isMountedRef.current) scheduleNext();
    });
  }, [poll, scheduleNext]);
  return {
    /** Whether there are lectures still being processed */
    hasActiveProcessing,
    /** Trigger an immediate poll */
    pollNow,
  };
}
