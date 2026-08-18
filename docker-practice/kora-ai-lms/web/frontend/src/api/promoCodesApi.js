import axiosInstance from "../config/axios";

const promoCodesApi = {
    getAllPromoCodes: (plan, active) => axiosInstance.get(`/api/promocodes?plan=${plan}&active=${active}`),
    createNewPromoCode: ({ code, description, expiryDate, eligibleUsers, maxUsagePerUser, applicablePlan }) => axiosInstance.post("/api/promocodes", { code, description, expiryDate, eligibleUsers, maxUsagePerUser, applicablePlan }),
    getPromoCodeDetailById: (id) => axiosInstance.get(`/api/promocodes/${id}`),
    updatePromoCode: (id, data) => axiosInstance.put(`/api/promocodes/${id}`, data),
    deletePromoCode: (id) => axiosInstance.delete(`/api/promocodes/${id}`),
    getAllUsers: () => axiosInstance.get("/api/promocodes/users/all"),
    validatePromoCode: (code, plan) => axiosInstance.post(`/api/promocodes/apply`, { code, plan }),
}

export default promoCodesApi;
