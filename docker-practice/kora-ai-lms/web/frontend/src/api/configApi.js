import axiosInstance from "../config/axios";

export const configApi = {
    getConfig: () => axiosInstance.get('/api/config'),
    updateConfig: (data) => axiosInstance.post('/api/config', data),
    addModel: (data) => axiosInstance.post('/api/config/models', data),
}