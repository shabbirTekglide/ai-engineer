import express from 'express';
import { login, sendOtp, verifyOtp, setPassword, forgotPassword, resetPassword, changePassword, getUser, logout, googleAuth, getCurrentUser, googleCallback, appleAuth, appleCallback, deleteAccount } from '../controllers/authController.js';
import { protectedDashboard } from '../middleware/authMiddleware.js';

const router = express.Router();

// Routes for registration flow
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/set-password', setPassword);
router.post('/change-password', changePassword);
router.post('/login', login);
router.get('/dashboard', protectedDashboard(), getUser);

// Forgot Password Routes
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
// router.post("/refresh", refresh);      // credentials: "include" on frontend
// router.post("/logout",protectedDashboard, logout);
router.post("/logout", logout);
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);
router.get('/apple', appleAuth);
router.post('/apple/callback', appleCallback);
router.get('/me', protectedDashboard(), getCurrentUser);
router.delete('/delete-account', protectedDashboard(), deleteAccount);
export default router;
