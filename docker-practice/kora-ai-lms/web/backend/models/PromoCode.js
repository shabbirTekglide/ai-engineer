import mongoose from 'mongoose';

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },

  description: {
    type: String,
    default: ''
  },

  expiryDate: {
    type: Date,
    required: true,
    index: true
  },

  // Users who are ELIGIBLE to use this promo code
  // If empty array, any user can use it (public promo code)
  eligibleUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],

  maxUsagePerUser: {
    type: Number,
    default: 1
  },

  // Users who have USED this promo code with usage details
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    // Usage count per user (for tracking multiple uses if allowed)
    usageCount: {
      type: Number,
      default: 1
    }
  }],

  // For which plan this promo code is valid
  applicablePlan: {
    type: String,
    enum: ['free', 'basic_plan', 'pro_plan', 'all'],
    default: 'all'
  },

  // Track total usage count
  totalUsed: {
    type: Number,
    default: 0
  },

  // Status of the promo code
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// ============================================
// 1. INDEXES
// ============================================
promoCodeSchema.index({ code: 1, isActive: 1, expiryDate: 1 });
promoCodeSchema.index({ eligibleUsers: 1, isActive: 1 });

// ============================================
// 2. PRE-SAVE HOOKS
// ============================================

// Ensure code is uppercase and trimmed before saving
promoCodeSchema.pre('save', function (next) {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase().trim();
  }
  next();
});

// Validate expiry date is in future for active codes
promoCodeSchema.pre('save', function (next) {
  if (this.isActive && this.expiryDate <= new Date()) {
    const error = new Error('Active promo code must have future expiry date');
    return next(error);
  }
  next();
});

// ============================================
// 3. INSTANCE METHODS
// ============================================

/**
 * Check if a specific user can use this promo code
 * @param {ObjectId|String} userId - User ID to check
 * @param {String} plan - Plan to apply to (optional, for applicablePlan check)
 * @returns {Object} Result object with canUse flag and reason
 */
promoCodeSchema.methods.canUserUse = function (userId, plan) {
  // Convert userId to string for comparison
  const userIdStr = userId.toString();
  if (!plan) {
    return {
      canUse: false,
      reason: 'Plan is required',
      code: 'MISSING_PLAN'
    };
  }
  // 1. Check if promo code is active
  if (!this.isActive) {
    return {
      canUse: false,
      reason: 'Promo code is not active',
      code: 'INACTIVE'
    };
  }

  // 2. Check if promo code has expired
  const now = new Date();
  if (now > this.expiryDate) {
    return {
      canUse: false,
      reason: 'Promo code has expired',
      code: 'EXPIRED'
    };
  }

  // 3. Check applicable plan if plan is specified
  if (plan && this.applicablePlan !== 'all') {
    if (this.applicablePlan !== plan) {
      return {
        canUse: false,
        reason: `Promo code not applicable for ${plan} plan`,
        code: 'INVALID_PLAN'
      };
    }
  }

  // 4. Check if user is in eligibleUsers (if specified)
  if (this.eligibleUsers && this.eligibleUsers.length > 0) {
    const isEligible = this.eligibleUsers.some(eligibleUserId =>
      eligibleUserId.toString() === userIdStr
    );

    if (!isEligible) {
      return {
        canUse: false,
        reason: 'You are not eligible for this promo code',
        code: 'NOT_ELIGIBLE'
      };
    }
  }

  // 5. Check user's previous usage against maxUsagePerUser
  const userUsage = this.usedBy.find(usage =>
    usage.userId.toString() === userIdStr
  );

  if (userUsage) {
    if (userUsage.usageCount >= this.maxUsagePerUser) {
      return {
        canUse: false,
        reason: `You have already used this promo code ${this.maxUsagePerUser} time(s)`,
        code: 'MAX_USAGE_REACHED',
        usageCount: userUsage.usageCount,
        maxUsage: this.maxUsagePerUser
      };
    }
  }

  return {
    canUse: true,
    reason: 'Promo code can be used',
    code: 'VALID',
    currentUsage: userUsage ? userUsage.usageCount : 0,
    remainingUses: userUsage ? this.maxUsagePerUser - userUsage.usageCount : this.maxUsagePerUser
  };
};

/**
 * Get user's usage information for this promo code
 * @param {ObjectId|String} userId - User ID to check
 * @returns {Object} User's usage info
 */
promoCodeSchema.methods.getUserUsageInfo = function (userId) {
  const userIdStr = userId.toString();
  const userUsage = this.usedBy.find(usage =>
    usage.userId.toString() === userIdStr
  );

  if (!userUsage) {
    return {
      hasUsed: false,
      usageCount: 0,
      lastUsed: null,
      remainingUses: this.maxUsagePerUser,
      canUse: true
    };
  }

  const remainingUses = Math.max(0, this.maxUsagePerUser - userUsage.usageCount);

  return {
    hasUsed: true,
    usageCount: userUsage.usageCount,
    lastUsed: userUsage.usedAt,
    remainingUses: remainingUses,
    canUse: remainingUses > 0
  };
};

/**
 * Record usage of this promo code by a user
 * @param {ObjectId|String} userId - User ID who is using the code
 * @param {String} plan - Plan the code is being used for
 * @param {Object} session - Mongoose session for transaction
 * @returns {Object} Result of the operation
 */
promoCodeSchema.methods.recordUsage = async function (userId, plan, session = null) {
  try {
    // Check if user can use the code
    const validation = this.canUserUse(userId, plan);
    if (!validation.canUse) {
      return {
        success: false,
        message: validation.reason,
        code: validation.code
      };
    }

    const userIdStr = userId.toString();
    const userUsageIndex = this.usedBy.findIndex(usage =>
      usage.userId.toString() === userIdStr
    );

    if (userUsageIndex >= 0) {
      // Increment existing user's usage count
      this.usedBy[userUsageIndex].usageCount += 1;
      this.usedBy[userUsageIndex].usedAt = new Date();
    } else {
      // Add new user to usedBy array
      this.usedBy.push({
        userId: userId,
        usedAt: new Date(),
        usageCount: 1
      });
    }

    // Increment total usage count
    this.totalUsed += 1;

    await this.save({ session });

    return {
      success: true,
      message: 'Promo code usage recorded successfully',
      usageCount: userUsageIndex >= 0 ? this.usedBy[userUsageIndex].usageCount : 1,
      totalUsed: this.totalUsed
    };

  } catch (error) {
    console.error('Error recording promo code usage:', error);
    return {
      success: false,
      message: 'Failed to record promo code usage',
      error: error.message
    };
  }
};

/**
 * Add user to eligible users list
 * @param {ObjectId|String} userId - User ID to add
 * @returns {Object} Result of the operation
 */
promoCodeSchema.methods.addEligibleUser = async function (userId) {
  try {
    const userIdStr = userId.toString();

    // Check if user is already eligible
    const isAlreadyEligible = this.eligibleUsers.some(eligibleUserId =>
      eligibleUserId.toString() === userIdStr
    );

    if (isAlreadyEligible) {
      return {
        success: false,
        message: 'User is already eligible for this promo code'
      };
    }

    // Add user to eligibleUsers
    this.eligibleUsers.push(userId);
    await this.save();

    return {
      success: true,
      message: 'User added to eligible users list',
      eligibleUsersCount: this.eligibleUsers.length
    };

  } catch (error) {
    console.error('Error adding eligible user:', error);
    return {
      success: false,
      message: 'Failed to add user to eligible list',
      error: error.message
    };
  }
};

/**
 * Remove user from eligible users list
 * @param {ObjectId|String} userId - User ID to remove
 * @returns {Object} Result of the operation
 */
promoCodeSchema.methods.removeEligibleUser = async function (userId) {
  try {
    const userIdStr = userId.toString();
    const initialLength = this.eligibleUsers.length;

    // Remove user from eligibleUsers
    this.eligibleUsers = this.eligibleUsers.filter(eligibleUserId =>
      eligibleUserId.toString() !== userIdStr
    );

    if (this.eligibleUsers.length === initialLength) {
      return {
        success: false,
        message: 'User was not in eligible users list'
      };
    }

    await this.save();

    return {
      success: true,
      message: 'User removed from eligible users list',
      eligibleUsersCount: this.eligibleUsers.length
    };

  } catch (error) {
    console.error('Error removing eligible user:', error);
    return {
      success: false,
      message: 'Failed to remove user from eligible list',
      error: error.message
    };
  }
};

/**
 * Check if promo code is expired
 * @returns {Boolean} True if expired
 */
promoCodeSchema.methods.isExpired = function () {
  return new Date() > this.expiryDate;
};

/**
 * Check if promo code is usable (active and not expired)
 * @returns {Boolean} True if usable
 */
promoCodeSchema.methods.isUsable = function () {
  return this.isActive && !this.isExpired();
};

// ============================================
// 4. STATIC METHODS
// ============================================

/**
 * Validate a promo code for a specific user
 * @param {String} code - Promo code to validate
 * @param {ObjectId|String} userId - User ID to validate for
 * @param {String} plan - Plan to apply to (optional)
 * @returns {Object} Validation result
 */
promoCodeSchema.statics.validatePromoCode = async function (code, userId, plan = null) {
  try {
    // Find the promo code
    const promoCode = await this.findOne({
      code: code.toUpperCase().trim(),
      isActive: true
    });

    if (!promoCode) {
      return {
        valid: false,
        message: 'Invalid or inactive promo code',
        code: 'NOT_FOUND'
      };
    }

    // Check if user can use it
    console.log('plan', plan);
    const canUseResult = promoCode.canUserUse(userId, plan);

    if (!canUseResult.canUse) {
      return {
        valid: false,
        message: canUseResult.reason,
        code: canUseResult.code,
        promoCode: null
      };
    }

    // Get user's usage info
    const userUsageInfo = promoCode.getUserUsageInfo(userId);

    return {
      valid: true,
      message: 'Promo code is valid',
      code: 'VALID',
      promoCode: {
        _id: promoCode._id,
        code: promoCode.code,
        description: promoCode.description,
        expiryDate: promoCode.expiryDate,
        applicablePlan: promoCode.applicablePlan
      },
      userUsageInfo: userUsageInfo,
      validationDetails: canUseResult
    };

  } catch (error) {
    console.error('Error validating promo code:', error);
    return {
      valid: false,
      message: 'Error validating promo code',
      code: 'VALIDATION_ERROR',
      error: error.message
    };
  }
};

/**
 * Find all promo codes eligible for a specific user
 * @param {ObjectId|String} userId - User ID
 * @param {String} plan - Filter by applicable plan (optional)
 * @returns {Array} List of eligible promo codes
 */
promoCodeSchema.statics.findEligibleForUser = async function (userId, plan = null) {
  try {
    const now = new Date();
    const userIdObj = new mongoose.Types.ObjectId(userId);

    // Base query: active, not expired
    const query = {
      isActive: true,
      expiryDate: { $gt: now }
    };

    // Add plan filter if specified
    if (plan) {
      query.$or = [
        { applicablePlan: 'all' },
        { applicablePlan: plan }
      ];
    }

    // Find all active promo codes
    const allPromoCodes = await this.find(query);

    // Filter by eligibility
    const eligiblePromoCodes = allPromoCodes.filter(promoCode => {
      // Check if user can use this promo code
      const canUseResult = promoCode.canUserUse(userId, plan);
      return canUseResult.canUse;
    });

    // Transform to include user usage info
    const result = eligiblePromoCodes.map(promoCode => {
      const userUsageInfo = promoCode.getUserUsageInfo(userId);

      return {
        _id: promoCode._id,
        code: promoCode.code,
        description: promoCode.description,
        expiryDate: promoCode.expiryDate,
        applicablePlan: promoCode.applicablePlan,
        totalUsed: promoCode.totalUsed,
        userUsageInfo: userUsageInfo,
        expiresInDays: Math.ceil((promoCode.expiryDate - now) / (1000 * 60 * 60 * 24))
      };
    });

    return result;

  } catch (error) {
    console.error('Error finding eligible promo codes:', error);
    return [];
  }
};

/**
 * Create a new promo code with validation
 * @param {Object} promoData - Promo code data
 * @returns {Object} Result of creation
 */
promoCodeSchema.statics.createPromoCode = async function (promoData) {
  try {
    // Validate required fields
    if (!promoData.code) {
      throw new Error('Promo code is required');
    }

    if (!promoData.expiryDate) {
      throw new Error('Expiry date is required');
    }

    // Ensure expiry date is in future
    const expiryDate = new Date(promoData.expiryDate);
    if (expiryDate <= new Date()) {
      throw new Error('Expiry date must be in the future');
    }

    // Create the promo code
    const promoCode = new this({
      code: promoData.code,
      description: promoData.description || '',
      expiryDate: expiryDate,
      eligibleUsers: promoData.eligibleUsers || [],
      maxUsagePerUser: promoData.maxUsagePerUser || 1,
      applicablePlan: promoData.applicablePlan || 'all',
      isActive: promoData.isActive !== undefined ? promoData.isActive : true
    });

    await promoCode.save();

    return {
      success: true,
      message: 'Promo code created successfully',
      promoCode: promoCode
    };

  } catch (error) {
    console.error('Error creating promo code:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return {
        success: false,
        message: 'Promo code already exists',
        code: 'DUPLICATE_CODE'
      };
    }

    return {
      success: false,
      message: error.message || 'Failed to create promo code',
      error: error.message
    };
  }
};

/**
 * Deactivate a promo code
 * @param {String} code - Promo code to deactivate
 * @returns {Object} Result of deactivation
 */
promoCodeSchema.statics.deactivatePromoCode = async function (code) {
  try {
    const result = await this.findOneAndUpdate(
      { code: code.toUpperCase().trim() },
      { isActive: false },
      { new: true }
    );

    if (!result) {
      return {
        success: false,
        message: 'Promo code not found'
      };
    }

    return {
      success: true,
      message: 'Promo code deactivated successfully',
      promoCode: result
    };

  } catch (error) {
    console.error('Error deactivating promo code:', error);
    return {
      success: false,
      message: 'Failed to deactivate promo code',
      error: error.message
    };
  }
};

/**
 * Get promo code usage statistics
 * @param {String} code - Promo code (optional, if not provided get all)
 * @returns {Object} Usage statistics
 */
promoCodeSchema.statics.getUsageStats = async function (code = null) {
  try {
    const query = code ? { code: code.toUpperCase().trim() } : {};

    const promoCodes = await this.find(query);

    const stats = {
      totalPromoCodes: promoCodes.length,
      activePromoCodes: promoCodes.filter(pc => pc.isActive && !pc.isExpired()).length,
      expiredPromoCodes: promoCodes.filter(pc => pc.isExpired()).length,
      totalUsage: promoCodes.reduce((sum, pc) => sum + pc.totalUsed, 0),
      uniqueUsers: new Set(
        promoCodes.flatMap(pc =>
          pc.usedBy.map(usage => usage.userId.toString())
        )
      ).size,
      byPlan: {
        all: promoCodes.filter(pc => pc.applicablePlan === 'all').length,
        free: promoCodes.filter(pc => pc.applicablePlan === 'free').length,
        basic_plan: promoCodes.filter(pc => pc.applicablePlan === 'basic_plan').length,
        pro_plan: promoCodes.filter(pc => pc.applicablePlan === 'pro_plan').length
      }
    };

    return {
      success: true,
      stats: stats
    };

  } catch (error) {
    console.error('Error getting usage stats:', error);
    return {
      success: false,
      message: 'Failed to get usage statistics',
      error: error.message
    };
  }
};

/**
 * Record usage of a promo code (Static wrapper for convenience in transactions)
 * @param {String} code - The promo code
 * @param {ObjectId|String} userId - The user ID
 * @param {String} plan - The plan ID
 * @param {Object} options - Options including mongoose session
 */
promoCodeSchema.statics.recordUsage = async function (code, userId, plan, options = {}) {
  const { session } = options;
  const promoCode = await this.findOne({
    code: code.toUpperCase().trim(),
    isActive: true
  }).session(session);

  if (!promoCode) {
    return {
      success: false,
      message: 'Promo code not found or inactive',
      code: 'NOT_FOUND'
    };
  }

  return await promoCode.recordUsage(userId, plan, session);
};

export default mongoose.model('PromoCode', promoCodeSchema);