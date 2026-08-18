import axiosInstance from "../config/axios";

const StudentProfileApi = {
    checkStudentProfileCreated: () =>
        axiosInstance.get('/api/student-profile/check', {
            headers: { 'Cache-Control': 'no-cache' }
        }),

    createStudentProfile: (formData) =>
        axiosInstance.post('/api/student-profile/create', formData, {
            headers: {
                'Cache-Control': 'no-cache',
                'Content-Type': 'multipart/form-data',
            },
        }),

    updateStudentProfile: (formData) =>
        axiosInstance.post('/api/student-profile/update', formData, {
            headers: {
                'Cache-Control': 'no-cache',
                'Content-Type': 'multipart/form-data',
            },
        }),

    getStudentProfile: () =>
        axiosInstance.get('/api/student-profile/', {
            headers: { 'Cache-Control': 'no-cache' }
        }),
};
export default StudentProfileApi;