import UsageLog from '../models/usageLog.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

/**
 * Get usage analytics aggregated by user and service
 * Returns complete user details with service-level token and cost breakdown
 */
export const getUsageAnalytics = async (req, res) => {
  try {
    // Aggregate usage logs by user and service
    const usageData = await UsageLog.aggregate([
      {
        $group: {
          _id: {
            userId: '$userId',
            service: '$service'
          },
          totalInputTokens: { $sum: '$inputTokens' },
          totalOutputTokens: { $sum: '$outputTokens' },
          totalTokens: { $sum: '$totalTokens' },
          totalCharacters: { $sum: '$characters' },
          totalAudioSeconds: { $sum: '$audioSeconds' },
          totalCostUsd: { $sum: '$costUsd' },
          currency: { $first: '$currency' },
          models: { $addToSet: '$model' },
          logCount: { $sum: 1 },
          firstUsed: { $min: '$createdAt' },
          lastUsed: { $max: '$createdAt' }
        }
      },
      {
        $sort: { '_id.userId': 1, '_id.service': 1 }
      }
    ]);

    // Get all unique user IDs and convert to ObjectId
    const userIds = [...new Set(usageData.map(item => item._id.userId.toString()))];
    const userIdsObjectIds = userIds.map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (error) {
        return null;
      }
    }).filter(id => id !== null);

    // Fetch user details (excluding calendar entries and sensitive data)
    const users = await User.find({ _id: { $in: userIdsObjectIds } })
      .select('-password -otp -otpExpiry -calendar')
      .lean();

    // Create a map of user data for quick lookup (remove calendar if still present)
    const userMap = {};
    users.forEach(user => {
      const { calendar, ...userWithoutCalendar } = user;
      userMap[user._id.toString()] = userWithoutCalendar;
    });

    // Group usage data by user
    const userUsageMap = {};
    usageData.forEach(item => {
      const userId = item._id.userId.toString();
      if (!userUsageMap[userId]) {
        userUsageMap[userId] = {
          user: userMap[userId] || null,
          services: []
        };
      }

      // Build service details
      const serviceDetails = {
        service: item._id.service,
        tokens: {
          input: item.totalInputTokens,
          output: item.totalOutputTokens,
          total: item.totalTokens
        },
        characters: item.totalCharacters,
        audioSeconds: item.totalAudioSeconds,
        cost: {
          amount: item.totalCostUsd,
          currency: item.currency || 'USD'
        },
        models: item.models,
        usageCount: item.logCount,
        firstUsed: item.firstUsed,
        lastUsed: item.lastUsed
      };

      userUsageMap[userId].services.push(serviceDetails);
    });

    // Calculate totals per user
    const result = Object.values(userUsageMap).map(userData => {
      const totalCost = userData.services.reduce((sum, service) => sum + service.cost.amount, 0);
      const totalTokens = userData.services.reduce((sum, service) => sum + service.tokens.total, 0);

      return {
        user: userData.user,
        services: userData.services,
        totals: {
          cost: {
            amount: parseFloat(totalCost.toFixed(6)),
            currency: 'USD'
          },
          tokens: totalTokens,
          serviceCount: userData.services.length
        }
      };
    });

    // Calculate global totals
    const globalTotals = {
      totalUsers: result.length,
      totalCost: {
        amount: parseFloat(result.reduce((sum, user) => sum + user.totals.cost.amount, 0).toFixed(6)),
        currency: 'USD'
      },
      totalTokens: result.reduce((sum, user) => sum + user.totals.tokens, 0),
      totalServices: [...new Set(usageData.map(item => item._id.service))].length
    };

    // Return response
    res.status(200).json({
      success: true,
      data: {
        summary: globalTotals,
        users: result
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching usage analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch usage analytics',
      error: error.message
    });
  }
};

/**
 * Get usage analytics for a specific user by user ID
 */
export const getUserUsageAnalytics = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Validate and convert userId to ObjectId
    let userIdObjectId;
    try {
      userIdObjectId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Aggregate usage logs for specific user
    const usageData = await UsageLog.aggregate([
      {
        $match: { userId: userIdObjectId }
      },
      {
        $group: {
          _id: {
            userId: '$userId',
            service: '$service'
          },
          totalInputTokens: { $sum: '$inputTokens' },
          totalOutputTokens: { $sum: '$outputTokens' },
          totalTokens: { $sum: '$totalTokens' },
          totalCharacters: { $sum: '$characters' },
          totalAudioSeconds: { $sum: '$audioSeconds' },
          totalCostUsd: { $sum: '$costUsd' },
          currency: { $first: '$currency' },
          models: { $addToSet: '$model' },
          logCount: { $sum: 1 },
          firstUsed: { $min: '$createdAt' },
          lastUsed: { $max: '$createdAt' }
        }
      },
      {
        $sort: { '_id.service': 1 }
      }
    ]);

    // Fetch user details (excluding calendar entries and sensitive data)
    let user = await User.findById(userIdObjectId)
      .select('-password -otp -otpExpiry -calendar')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Ensure calendar is removed if still present
    if (user.calendar) {
      const { calendar, ...userWithoutCalendar } = user;
      user = userWithoutCalendar;
    }

    // Build service details
    const services = usageData.map(item => ({
      service: item._id.service,
      tokens: {
        input: item.totalInputTokens,
        output: item.totalOutputTokens,
        total: item.totalTokens
      },
      characters: item.totalCharacters,
      audioSeconds: item.totalAudioSeconds,
      cost: {
        amount: item.totalCostUsd,
        currency: item.currency || 'USD'
      },
      models: item.models,
      usageCount: item.logCount,
      firstUsed: item.firstUsed,
      lastUsed: item.lastUsed
    }));

    // Calculate totals
    const totalCost = services.reduce((sum, service) => sum + service.cost.amount, 0);
    const totalTokens = services.reduce((sum, service) => sum + service.tokens.total, 0);

    res.status(200).json({
      success: true,
      data: {
        user: user,
        services: services,
        totals: {
          cost: {
            amount: parseFloat(totalCost.toFixed(6)),
            currency: 'USD'
          },
          tokens: totalTokens,
          serviceCount: services.length
        }
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching user usage analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user usage analytics',
      error: error.message
    });
  }
};

export const getSubscriptionUsageAnalytics = async (req, res) => {
  try {
    const { subscriptionId } = req.params;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // Validate and convert userId to ObjectId
    let subscriptionIdObjectId;
    try {
      subscriptionIdObjectId = new mongoose.Types.ObjectId(subscriptionId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription ID format'
      });
    }

    // Aggregate usage logs for specific user
    const usageData = await UsageLog.aggregate([
      {
        $match: { subscriptionId: subscriptionIdObjectId }
      },
      {
        $group: {
          _id: {
            subscriptionId: '$subscriptionId',
            service: '$service'
          },
          totalInputTokens: { $sum: '$inputTokens' },
          totalOutputTokens: { $sum: '$outputTokens' },
          totalTokens: { $sum: '$totalTokens' },
          totalAudioSeconds: { $sum: '$audioSeconds' },
          totalCostUsd: { $sum: '$costUsd' },
          currency: { $first: '$currency' },
          models: { $addToSet: '$model' },
        }
      },
      {
        $sort: { '_id.service': 1 }
      }
    ]);

    // Build service details
    const services = usageData.map(item => ({
      service: item._id.service,
      tokens: {
        input: item.totalInputTokens,
        output: item.totalOutputTokens,
        total: item.totalTokens
      },
      audioSeconds: item.totalAudioSeconds,
      cost: {
        amount: item.totalCostUsd,
        currency: item.currency || 'USD'
      },
      models: item.models,
    }));

    // Calculate totals
    const totalCost = services.reduce((sum, service) => sum + service.cost.amount, 0);
    const totalTokens = services.reduce((sum, service) => sum + service.tokens.total, 0);

    res.status(200).json({
      success: true,
      data: {
        services: services,
        totals: {
          cost: {
            amount: parseFloat(totalCost.toFixed(6)),
            currency: 'USD'
          },
          tokens: totalTokens,
          serviceCount: services.length
        }
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching user usage analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user usage analytics',
      error: error.message
    });
  }
};
