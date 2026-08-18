import axiosInstance from "../config/axios"

const paymentApi = {
    createSubscription: (formData) => {
        return axiosInstance.post('/api/subscriptions/create', formData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    },
    createSubscriptionByCoupon: (formData) => {
        return axiosInstance.post('/api/subscriptions/create-by-coupon', formData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    },
    subscriptionInfo: () => axiosInstance.get('/api/subscriptions/subscriptionInfo'),
    //   createSubscription: (formData, { idempotencyKey } = {}) => {
    //     // IMPORTANT: no logging of PAN/token/PII in prod
    //     return axiosInstance.post('/api/subscriptions/create', formData, {
    //       headers: {
    //         'Content-Type': 'application/json',
    //         'Accept': 'application/json',
    //         // Do this server-side too (idempotency stored/validated on server)
    //         ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    //       },
    //       timeout: 15000
    //     });
    //  },

    getSubscriptionStatus: ({ signal } = {}) => {
        return axiosInstance.get('/api/subscriptions/status', {
            // signal,
            headers: { 'Cache-Control': 'no-store' },
            // timeout: 8000
        });
    },
    getAllSubscriptions: (plan) => {
        return axiosInstance.get(`/api/subscriptions/all-subscriptions?plan=${plan}`);
    },
    cancelSubscription: (userId, password) => {
        // POST request use karein secure data ke liye
        return axiosInstance.post(`/api/subscriptions/cancel`, {
            userId,
            password
        });
    },
    getSubscriptionUsageAnalytics: (subscriptionId) => {
        return axiosInstance.get(`api/public/subscription-usage-analytics/${subscriptionId}`);
    },
}

export default paymentApi;
