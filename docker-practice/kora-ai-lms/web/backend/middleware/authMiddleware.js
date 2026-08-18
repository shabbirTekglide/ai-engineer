// middleware/authMiddleware.js
import Session from '../models/session.js';
import User from '../models/User.js';
import { verifyToken } from '../services/tokenService.js';

// Change 1: Arrow function ab pehle role leti hai (default 'student')
export const protectedDashboard = (requiredRole = 'student') => async (req, res, next) => {
  try {
    const hdr = req.get('authorization') || '';
    // Support token via Authorization header (primary) or query param (for SSE/EventSource)
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : (req.query?.token || null);
    if (!token) return res.status(401).json({ message: 'Missing bearer token' });

    const payload = verifyToken(token); // throws if invalid/expired
    
    // Initial payload check
    if (!payload.sid) {
      return res.status(401).json({ message: 'Invalid token (no session id)' });
    }

    const dbSession = await Session.findById(payload.sid);
    if (!dbSession || dbSession.revokedAt) {
      return res.status(401).json({ message: 'Session revoked or not found' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    dbSession.lastUsedAt = new Date();
    await dbSession.save();

    req.user = {
      id: user._id,
      email: user.email,
      role: user.role, // Make sure User model me role field ho
      sid: payload.sid,
      subscriptionType: user.subscription?.plan_id, // Safe navigation added
      subscriptionStatus: user.subscription?.status,
      availableHours: user.availableSeconds ? user.availableSeconds / 3600 : 0, // Assuming seconds conversion logic
      createdAt: user.createdAt
    };

    // CASE 1: Agar route sabke liye open hai ('all')
    if (requiredRole === 'all') {
      // Sirf 'admin' aur 'student' allow hain. Koi 'random' role allow nahi hoga.
      const allowedRoles = ['admin', 'student'];
      
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
          message: 'Access denied. Only Admins and Students are allowed.' 
        });
      }
    } 
    // CASE 2: Agar specific role required hai (e.g., 'admin' only)
    else {
      if (req.user.role !== requiredRole) {
        return res.status(403).json({ 
          message: `Access denied. Required role: ${requiredRole}` 
        });
      }
    }
    // ------------------------------------------

    next();
  } catch (err) {
    const isAuthError =
      err.name === 'JsonWebTokenError' ||
      err.name === 'TokenExpiredError' ||
      err.message?.toLowerCase()?.includes('bearer') ||
      err.message?.toLowerCase()?.includes('token');

    const code = isAuthError ? 401 : 500;
    return res.status(code).json({
      message: isAuthError ? 'Unauthorized' : 'Server error',
      error: err.message,
    });
  }
};
