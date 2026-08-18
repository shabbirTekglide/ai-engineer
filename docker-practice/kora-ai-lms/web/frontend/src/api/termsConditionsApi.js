import axiosInstance from "../config/axios";

const TermsConditionsApi = {
    getTermsConditions: () => axiosInstance.get("/api/terms-condition"),
    acceptTermsConditions: () => axiosInstance.post("/api/terms-condition/accept"),
    updateTermsConditions: () => axiosInstance.post("/api/terms-condition/update"),
}

export default TermsConditionsApi;