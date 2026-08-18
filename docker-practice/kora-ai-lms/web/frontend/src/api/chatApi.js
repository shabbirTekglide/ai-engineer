// api/chatApi.js
import axiosInstance from '../config/axios.js';

const ChatApi = {
  /**
   * Create or get a chat thread
   * @param {Object} params - { context: 'general' | 'class' | 'lecture', classId?, lectureId? }
   */
  createOrGetThread: ({ context, classId, lectureId }) =>
    axiosInstance.post('/api/chat/threads', { context, classId, lectureId }),

  /**
   * Get all threads for the user
   * @param {Object} filters - { context?, classId?, lectureId? }
   */
  getUserThreads: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.context) params.append('context', filters.context);
    if (filters.classId) params.append('classId', filters.classId);
    if (filters.lectureId) params.append('lectureId', filters.lectureId);
    return axiosInstance.get(`/api/chat/threads?${params.toString()}`);
  },

  /**
   * Get a specific thread with messages
   * @param {string} threadId
   */
  getThreadById: (threadId) =>
    axiosInstance.get(`/api/chat/threads/${threadId}`),

  /**
   * Send a message to a thread
   * @param {string} threadId
   * @param {string} message
   */
  sendMessage: (threadId, message) =>
    axiosInstance.post(`/api/chat/threads/${threadId}/messages`, { message }),

  /**
   * Delete a thread
   * @param {string} threadId
   */
  deleteThread: (threadId) =>
    axiosInstance.delete(`/api/chat/threads/${threadId}`),

  /**
   * Clear all messages from a thread
   * @param {string} threadId
   */
  clearThread: (threadId) =>
    axiosInstance.post(`/api/chat/threads/${threadId}/clear`)
};

export default ChatApi;

