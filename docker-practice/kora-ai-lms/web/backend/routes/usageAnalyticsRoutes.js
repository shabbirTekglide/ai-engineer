import express from 'express';
import { getSubscriptionUsageAnalytics, getUsageAnalytics, getUserUsageAnalytics } from '../controllers/usageAnalyticsController.js';
import { validateParams } from '../middleware/validate.js';
import { protectedDashboard } from '../middleware/authMiddleware.js';
import { objectIdParam } from '../validations/common.validation.js';

const router = express.Router();

/**
 * @route   GET /api/public/usage-analytics
 * @desc    Get aggregated usage analytics for all users
 * @access  Public
 */
router.get('/usage-analytics', getUsageAnalytics);

/**
 * @route   GET /api/public/usage-analytics/:userId
 * @desc    Get usage analytics for a specific user
 * @access  Public
 */
router.get('/usage-analytics/:userId', getUserUsageAnalytics);
router.get('/subscription-usage-analytics/:subscriptionId', protectedDashboard('admin'), validateParams(objectIdParam('subscriptionId')), getSubscriptionUsageAnalytics);

export default router;

