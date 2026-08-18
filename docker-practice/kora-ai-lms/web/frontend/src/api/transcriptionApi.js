import axiosInstance from "../config/axios.js";

/**
 * Transcription API
 * =================
 * 
 * API client for transcription processing and progress tracking
 * Provides real-time updates and status monitoring
 */
const TranscriptionApi = {
  /**
   * Get transcription processing status for a lecture
   * @param {string} lectureId - Lecture ID
   * @returns {Promise} - API response with transcription status
   */
  getTranscriptionStatus: (lectureId) => 
    axiosInstance.get(`/api/transcription/${lectureId}/status`, {
      headers: { 'Cache-Control': 'no-cache' }
    }),

  /**
   * Get real-time transcription progress for a lecture
   * @param {string} lectureId - Lecture ID
   * @returns {Promise} - API response with progress data
   */
  getTranscriptionProgress: (lectureId) => 
    axiosInstance.get(`/api/transcription/${lectureId}/progress`, {
      headers: { 'Cache-Control': 'no-cache' }
    }),

  /**
   * Retry failed transcription for a lecture
   * @param {string} lectureId - Lecture ID
   * @returns {Promise} - API response
   */
  retryTranscription: (lectureId) => 
    axiosInstance.post(`/api/transcription/${lectureId}/retry`, {}, {
      headers: { 'Cache-Control': 'no-cache' }
    }),

  /**
   * Cancel ongoing transcription for a lecture
   * @param {string} lectureId - Lecture ID
   * @returns {Promise} - API response
   */
  cancelTranscription: (lectureId) => 
    axiosInstance.delete(`/api/transcription/${lectureId}/cancel`, {
      headers: { 'Cache-Control': 'no-cache' }
    }),

  /**
   * Subscribe to real-time transcription progress updates
   * Uses Server-Sent Events (SSE) for live updates
   * @param {string} lectureId - Lecture ID
   * @param {function} onMessage - Callback for progress updates
   * @param {function} onError - Callback for errors
   * @param {function} onClose - Callback for connection close
   * @returns {EventSource} - EventSource instance for SSE
   */
  subscribeToProgress: (lectureId, onMessage, onError, onClose) => {
    const eventSource = new EventSource(`/api/transcription/${lectureId}/progress`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Error parsing SSE data:', error);
        onError(error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      onError(error);
    };
    
    eventSource.addEventListener('close', () => {
      eventSource.close();
      onClose();
    });
    
    return eventSource;
  },
};

export default TranscriptionApi;
