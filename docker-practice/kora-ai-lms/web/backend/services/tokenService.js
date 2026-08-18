// services/tokenService.js
import jwt from "jsonwebtoken";
import "dotenv/config";

const ACCESS_TTL = process.env.ACCESS_TTL_MINUTES ? `${process.env.ACCESS_TTL_MINUTES}m` : '10m';

export const signAccess = (user, sessionId) =>
  jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      sid: String(sessionId), // <- IMPORTANT

    //    has_active_subscription: user.has_active_subscription || false,
    //   subscription_tier: user.subscription_tier || 'free',
    //   subscription_status: user.subscription?.status || 'inactive',
    //   is_subscribed: user.has_active_subscription && 
    //                 user.subscription?.status === 'active' && 
    //                 new Date() < new Date(user.subscription.current_period_end)
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL, issuer: 'api.kora' }
  );

// legacy names still used elsewhere (e.g., reset/change password emails)
export const generateToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

export const resetPasswordToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );


export const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);
