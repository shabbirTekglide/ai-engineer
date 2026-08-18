import axiosInstance from "../config/axios";

export const adminLectureApi = {
  getStats: () => axiosInstance.get("/api/admin/lectures/stats"),
  list: (params) => axiosInstance.get("/api/admin/lectures", { params }),
  getDetail: (lectureId) => axiosInstance.get(`/api/admin/lectures/${lectureId}`),
};
