import axiosInstance from "../config/axios.js";

/**
 * Syllabus API
 * ============
 * 
 * API client for syllabus management using the new dedicated syllabus routes
 * Replaces the old class-based syllabus endpoints
 */
const SyllabusApi = {
  /**
   * Upload and parse syllabus file for a class
   * @param {string} classId - Class ID
   * @param {FormData} formData - Form data containing syllabus file and semester start date
   * @returns {Promise} - API response with parsed syllabus data
   */
  uploadSyllabus: (classId, formData) => 
    axiosInstance.post(`/api/syllabus/${classId}/upload`, formData, {
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'multipart/form-data',
      },
    }),

  /**
   * Get parsed syllabus for a class
   * @param {string} classId - Class ID
   * @returns {Promise} - API response with syllabus data
   */
  getSyllabus: (classId) => 
    axiosInstance.get(`/api/syllabus/${classId}`, {
      headers: { 'Cache-Control': 'no-cache' }
    }),

  /**
   * Delete syllabus for a class
   * @param {string} classId - Class ID
   * @returns {Promise} - API response
   */
  deleteSyllabus: (classId) => 
    axiosInstance.delete(`/api/syllabus/${classId}`, {
      headers: { 'Cache-Control': 'no-cache' }
    }),

  /**
   * Get syllabus events for calendar integration
   * @param {string} classId - Class ID
   * @returns {Promise} - API response with events data
   */
  getSyllabusEvents: (classId) => 
    axiosInstance.get(`/api/syllabus/${classId}/events`, {
      headers: { 'Cache-Control': 'no-cache' }
    }),

  /**
   * Extract class data from syllabus file (for class creation)
   * @param {FormData} formData - Form data containing syllabus file
   * @returns {Promise} - API response with extracted class data
   */
  extractClassFromSyllabus: (formData) => 
    axiosInstance.post('/api/class/syllabusExtractClass', formData, {
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'multipart/form-data',
      },
    }),
};

export default SyllabusApi;
