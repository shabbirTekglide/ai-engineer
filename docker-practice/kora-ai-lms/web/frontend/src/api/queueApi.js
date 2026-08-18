import axiosInstance from "../config/axios.js";

/**
 * Queue API
 * =========
 *
 * API client for queue management and progress tracking.
 * Uses authenticated HTTP polling instead of SSE for reliable
 * operation behind reverse proxies (Nginx, Cloudflare, etc.)
 */
const QueueApi = {
  /**
   * Get all jobs for the authenticated user
   * @param {Object} params - Query parameters (status, limit)
   * @returns {Promise} - API response with jobs list
   */
  getUserJobs: (params = {}) =>
    axiosInstance.get("/api/queue/jobs", {
      params,
      headers: { "Cache-Control": "no-cache" },
    }),

  /**
   * Get specific job details by job ID
   * @param {string} jobId - Job ID
   * @returns {Promise} - API response with job details
   */
  getJobById: (jobId) =>
    axiosInstance.get(`/api/queue/jobs/${jobId}`, {
      headers: { "Cache-Control": "no-cache" },
    }),

  /**
   * Get job for a specific lecture
   * @param {string} lectureId - Lecture ID
   * @returns {Promise} - API response with job details
   */
  getJobByLectureId: (lectureId) =>
    axiosInstance.get(`/api/queue/lecture/${lectureId}/job`, {
      headers: { "Cache-Control": "no-cache" },
    }),

  /**
   * Get progress for a lecture via authenticated HTTP request.
   * This replaces the old SSE-based approach which broke behind proxies.
   * @param {string} lectureId - Lecture ID
   * @returns {Promise} - API response with progress data
   */
  getJobProgress: (lectureId) =>
    axiosInstance.get(`/api/queue/lecture/${lectureId}/job`, {
      headers: { "Cache-Control": "no-cache" },
      timeout: 15000, // 15s timeout for polling requests
    }),

  /**
   * Subscribe to real-time progress updates using SSE (with auth via query param).
   * Falls back gracefully — callers should prefer polling via useProcessingPoller.
   *
   * @param {string} lectureId - Lecture ID
   * @param {function} onMessage - Callback for progress updates
   * @param {function} onError - Callback for errors
   * @param {function} onClose - Callback for connection close
   * @returns {EventSource|null} - EventSource instance, or null if token unavailable
   */
  subscribeToProgress: (lectureId, onMessage, onError, onClose) => {
    const baseURL = axiosInstance.defaults.baseURL || "";
    const token = localStorage.getItem("token");

    if (!token) {
      console.warn("[SSE] No auth token found — skipping SSE subscription");
      onError(new Error("No auth token"));
      return null;
    }

    // Pass token as query parameter since EventSource cannot send headers
    const url = `${baseURL}/api/queue/lecture/${lectureId}/progress?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);

        // Auto-close on terminal events
        if (data.type === "completed" || data.status === "completed" || data.status === "failed") {
          eventSource.close();
          onClose();
        }
      } catch (error) {
        console.error("Error parsing SSE data:", error);
      }
    };

    eventSource.onerror = () => {
      // Don't immediately treat connection drops as failures.
      // SSE auto-reconnects by default — only report if CLOSED.
      if (eventSource.readyState === EventSource.CLOSED) {
        console.warn("[SSE] Connection closed for lecture", lectureId);
        onError(new Error("SSE connection closed"));
        onClose();
      }
      // readyState CONNECTING = auto-reconnecting, don't report as error
    };

    eventSource.addEventListener("close", () => {
      eventSource.close();
      onClose();
    });

    return eventSource;
  },

  /**
   * Retry a failed job
   * @param {string} jobId - Job ID
   * @returns {Promise} - API response
   */
  retryJob: (jobId) =>
    axiosInstance.post(`/api/queue/jobs/${jobId}/retry`, {}, {
      headers: { "Cache-Control": "no-cache" },
    }),

  /**
   * Cancel a queued or processing job
   * @param {string} jobId - Job ID
   * @returns {Promise} - API response
   */
  cancelJob: (jobId) =>
    axiosInstance.delete(`/api/queue/jobs/${jobId}/cancel`, {
      headers: { "Cache-Control": "no-cache" },
    }),

  /**
   * Get queue statistics
   * @returns {Promise} - API response with queue stats
   */
  getQueueStats: () =>
    axiosInstance.get("/api/queue/stats", {
      headers: { "Cache-Control": "no-cache" },
    }),
};

export default QueueApi;
