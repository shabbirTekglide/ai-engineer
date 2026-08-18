import { jwtDecode } from "jwt-decode";
export const isTokenValid = (token) => {
  try {
    const decoded = jwtDecode(token);
    console.log(decoded);
    const currentTime = Date.now() / 1000; // Current time in seconds

    if (decoded.exp > currentTime) {
      // Return the token's validity and update fields from the token payload
      return {
        valid: true,
        user: decoded.user || null, // Extract user from the token payload
        role: decoded.role || null, // Extract role from the token payload
        otpVerified: true, // Extract otpVerified status from the token payload
        sid: decoded.sid || null, // Extract session ID from the token payload
        // is_subscribed: decoded.is_subscribed || false, // Extract subscription status from the token payload
        // has_active_subscription: decoded.has_active_subscription || false,
        // subscription_tier: decoded.subscription_tier || 'free',
        // subscription_status: decoded.subscription_status || 'inactive',
      };
    } else {
      console.log("test3");
      // localStorage.removeItem('token');
      return {
        valid: false,
        user: null,
        role: null,
        otpVerified: false,
      };
    }
  } catch (error) {
    return {
      valid: false,
      user: null,
      role: null,
      otpVerified: false,
    };
  }
};
