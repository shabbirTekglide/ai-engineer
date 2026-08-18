// axiosConfig.js (updated)
import axios from 'axios';
import { logout, logoutUser, setSubscriptionInfo, toggleTrialExpired } from '../store/slicers/authSlice.js';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: parseInt(import.meta.env.VITE_REQUEST_TIMEOUT_MS) || 40 * 60 * 1000,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default axiosInstance;

export function attachAxiosInterceptors(store) {
  axiosInstance.interceptors.response.use(
    (res) => res,
    //   {
    //   // --- SUCCESS HANDLER START ---
    //   const currentUrl = res.config.url || '';
    //   // Define paths to exclude from triggering subscription info update
    //   const excludedPaths = [
    //     'subscriptionInfo', 
    //     '/auth', 
    //   ];
    //   // Check karein ki current URL me upar diya gaya koi bhi path match ho raha hai ya nahi
    //   const isExcludedCall = excludedPaths.some(path => currentUrl.includes(path));
    //   // Agar excluded call nahi hai, tabhi Subscription Info update karein
    //   if (!isExcludedCall) {
    //      store.dispatch(getSubscriptionInfo());
    //   }
    //   return res;
    // },
    (error) => {
      const responseData = error?.response?.data || {};
      const msg = responseData.message || responseData.Message || '';
      const errorMsg = responseData.error || '';
      const status = error?.response?.status;
      const code = responseData.code;
      let data = { type: responseData?.type, status: responseData?.status, availableHours: responseData?.availableHours, lastPaymentDate: responseData?.lastPaymentDate }

      const isTrialExpired = status === 403 && (code === 'TRIAL_EXPIRED' || code === 'SUBSCRIPTION_EXPIRED' || code === 'SUBSCRIPTION_CANCELLED' || code === 'SUBSCRIPTION_COMPLETED');

      console.log('isTrialExpired', isTrialExpired, 'code:', code);
      if (isTrialExpired) {
        store.dispatch(toggleTrialExpired(true));
        store.dispatch(setSubscriptionInfo(data));
      }

      const isAuthFail =
        status === 401 &&
        (msg === 'Session revoked or not found' ||
          msg === 'Invalid token (no session id)' ||
          msg === 'Unauthorized' ||
          msg?.toLowerCase()?.includes('token') ||
          errorMsg?.toLowerCase()?.includes('jwt expired') ||
          errorMsg?.toLowerCase()?.includes('token'));

      if (isAuthFail) {
        store.dispatch(logoutUser())
          .then(() => {
            store.dispatch(logout());
            localStorage.removeItem('token');
          })
          .catch((error) => {
            console.error('Logout error:', error);
            store.dispatch(logout());
            localStorage.removeItem('token');
          });
      }

      return Promise.reject(error);
    }
  );
}
