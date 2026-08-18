import axiosInstance from "../config/axios";

const referenceCodesApi = {
    getAllReferenceCodes: ({ active, semester }) => {
        const params = new URLSearchParams();
        if (active !== null && active !== undefined) params.set('active', String(active));
        if (semester && semester !== 'all') params.set('semester', semester);
        const query = params.toString();
        return axiosInstance.get(`/api/reference-codes${query ? `?${query}` : ''}`);
    },
    createReferenceCode: (payload) =>
        axiosInstance.post("/api/reference-codes", payload),
    getReferenceCodeDetailById: (id) => axiosInstance.get(`/api/reference-codes/${id}`),
    updateReferenceCode: (id, data) => axiosInstance.put(`/api/reference-codes/${id}`, data),
    deleteReferenceCode: (id) => axiosInstance.delete(`/api/reference-codes/${id}`),
    importReferenceCodes: (formData) =>
        axiosInstance.post("/api/reference-codes/import", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        }),

    getAllUsers: () => axiosInstance.get("/api/reference-codes/users/all"),
    getAttributionReport: () => axiosInstance.get("/api/reference-codes/attribution/report"),
}

export default referenceCodesApi;
