import axiosInstance from "../config/axios.js";
const ClassApi = {
  getClassLecturesId: () => axiosInstance.get("/api/class/classLectures"),

  createClass: (formData) =>
    axiosInstance.post("/api/class",formData ,{
  headers: { 
    'Cache-Control': 'no-cache' ,
    'Content-Type': 'multipart/form-data',
  }}),
  getClasses: () => axiosInstance.get("/api/class/"),
  getClassById: (classId) =>
    axiosInstance.get(`/api/class/${(classId)}`, {
  headers: { 'Cache-Control': 'no-cache' }}),
   uploadSyllabus: (classId, formData) => axiosInstance.post(`/api/class/${(classId)}/syllabus`,formData ,{
  headers: { 
    'Cache-Control': 'no-cache' ,
    'Content-Type': 'multipart/form-data',
  },
  // Extended timeout for syllabus parsing (40 minutes)
  timeout: parseInt(import.meta.env.VITE_SYLLABUS_UPLOAD_TIMEOUT_MS) || 40 * 60 * 1000, // 40 minutes
}),
  updateClass: (classId, formData) =>
    axiosInstance.put(`/api/class/${classId}`, formData, {
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
      },
    }),
  deleteClass: (classId) =>
    axiosInstance.delete(`/api/class/${classId}`, {
      headers: { 'Cache-Control': 'no-cache' },
    }),
};
export default ClassApi;
