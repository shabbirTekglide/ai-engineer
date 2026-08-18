import axiosInstance from "../config/axios.js";

const LectureApi = {
  createLecture: async ({ classId, formData }) => {
    try {
      const response = await axiosInstance.post(
        `/api/lecture/${classId}/lectures`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      return response;
    } catch (error) {
      throw error;
    }
  },
  reprocessLecture: async ({ lectureId }) => {
    try {
      const response = await axiosInstance.post(
        `/api/lecture/reprocess/${lectureId}`,
      );
      return response;
    } catch (error) {
      throw error;
    }
  },
  deleteLecture: async ({ lectureId }) => {
    try {
      const response = await axiosInstance.delete(`/api/lecture/${lectureId}`);
      return response;
    } catch (error) {
      throw error;
    }
  },
  getAllLectures: (classId, page = 1, limit = 5, status = "all") =>
    axiosInstance.get(
      `/api/lecture/${classId}/lectures?page=${page}&limit=${limit}&status=${status}`,
    ),
  getCurrentLecture: (lectureId) =>
    axiosInstance.get(`/api/lecture/${lectureId}/lecture`),

  /**
   * Fetch processing statuses for multiple lectures in a single request.
   * Used by the polling system to efficiently check status of active lectures.
   * @param {string[]} lectureIds - Array of lecture IDs
   * @returns {Promise} - { statuses: { [lectureId]: { processingStatus, processingError } } }
   */
  batchStatus: (lectureIds) =>
    axiosInstance.post(
      "/api/lecture/batch-status",
      { lectureIds },
      {
        headers: { "Cache-Control": "no-cache" },
        timeout: 15000,
      },
    ),

  // Upload Document
  uploadDoc: async ({ classId, formData }) => {
    return axiosInstance.post(
      `/api/lecture/${classId}/lectures/document`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
  },
};

export default LectureApi;
