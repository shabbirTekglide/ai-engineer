import PromoCode from "../models/PromoCode.js";
import User from "../models/User.js";
import { sendPromocodeEmail } from "../utils/emailHelper.js";

/**
 * Get all promo codes (Admin only)
 */
export const getAllPromoCodes = async (req, res) => {
  try {
    const { plan, active } = req.query;
    const query = {};

    if (plan && plan !== 'all') {
      query.applicablePlan = plan;
    }

    if (active === 'true') {
      query.isActive = true;
      query.expiryDate = { $gt: new Date() };
    } else if (active === 'false') {
      query.$or = [
        { isActive: false },
        { expiryDate: { $lte: new Date() } }
      ];
    }

    const promoCodes = await PromoCode.find(query)
      .select('_id code expiryDate totalUsed isActive')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: promoCodes,
      count: promoCodes.length
    });
  } catch (error) {
    console.error('Get all promo codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create new promo code (Admin only)
 */
export const createNewPromoCode = async (req, res) => {
  try {
    const promoData = req.validated || req.body;

    // Check if code already exists
    const existing = await PromoCode.findOne({ code: promoData.code.toUpperCase().trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Promo code already exists'
      });
    }

    const newPromo = await PromoCode.create(promoData);
    const users = await User.find({ _id: { $in: promoData.eligibleUsers } }).select('email').lean();
    const emails = users.map(user => user.email);
    await sendPromocodeEmail(newPromo.code, newPromo.description, newPromo.expiryDate, newPromo.maxUsagePerUser, emails, newPromo.applicablePlan);
    res.status(201).json({
      success: true,
      message: 'Promo code created successfully',
      data: newPromo
    });
  } catch (error) {
    console.error('Create promo code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update existing promo code (Admin only)
 */
export const updatePromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.validated || req.body;

    if (updateData.code) {
      const existing = await PromoCode.findOne({
        code: updateData.code.toUpperCase().trim(),
        _id: { $ne: id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Promo code with this name already exists'
        });
      }
    }

    const updatedPromo = await PromoCode.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedPromo) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Promo code updated successfully',
      data: updatedPromo
    });
  } catch (error) {
    console.error('Update promo code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get promo code detail by ID (Admin only)
 */
export const getPromoCodeDetailById = async (req, res) => {
  try {
    const { id } = req.params;
    const promoCode = await PromoCode.findById(id).lean();

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found'
      });
    }

    res.status(200).json({
      success: true,
      data: promoCode
    });
  } catch (error) {
    console.error('Get promo code detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete promo code (Admin only)
 */
export const deletePromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPromo = await PromoCode.findByIdAndDelete(id);

    if (!deletedPromo) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Promo code deleted successfully'
    });
  } catch (error) {
    console.error('Delete promo code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'student' }).select('name email isVerified').lean();
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const applyPromoCode = async (req, res) => {
  try {
    const { code, plan } = req.body;
    const userId = req.user.id;
    console.log('user_id3', userId);
    console.log('plan_id', plan);
    console.log('code', code);
    const promoCode = await PromoCode.validatePromoCode(code, userId, plan);
    res.status(200).json(promoCode);
  } catch (error) {
    console.error('Apply promo code error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};