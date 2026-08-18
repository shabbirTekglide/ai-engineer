import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { CalendarEventSchema } from '../models/calenderEvents.js';

// ---------------------------------------------------------
// 1. Updated Subscription Schema
// ---------------------------------------------------------
const subscriptionSchema = new mongoose.Schema({
  plan_id: {
    type: String,
    enum: ['free', 'basic_plan', 'pro_plan', 'nickel_test', 'penny_test', 'KBASSUB15', 'KPROSUB20'], // Enum yahan shift kar diya
    default: 'free',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'completed', 'failed'],
    default: 'active'
  },
  source: {
    type: String,
    enum: ['skybank', 'apple', 'apple_iap', 'admin', 'promo'],
    default: 'skybank'
  },
  source_transaction_id: {
    type: String,
    default: null,
    index: true  // For quick lookup
  },
  original_transaction_id: {
    type: String,
    default: null
  },
  // ✅ NEW: Expiry date from Apple (for auto-renewal sync)
  expires_at: {
    type: Date,
    default: null
  },
  // ✅ NEW: Last webhook receipt data (for debugging)
  last_receipt_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  last_failure_reason: {
    type: String,
    default: null
  },
  last_failure_date: {
    type: Date,
    default: null
  },
  // Available Seconds ab Subscription ka hissa hai
  availableSeconds: {
    type: Number,
    default: 10800,
    min: 0
  },
  subscription_id: {
    type: String,
    default: null
  },
  customer_vault_id: {
    type: String,
    default: null
  },
  transaction_id: {
    type: String,
    default: null
  },
  transaction_amount: {
    type: String,
    default: null
  },
  last_payment_date: {
    type: Date,
    default: null
  },
}, { timestamps: true });

// Billing Address Schema
const billingAddressSchema = new mongoose.Schema({
  first_name: { type: String },
  last_name: { type: String },
  email: { type: String }
});

// ---------------------------------------------------------
// 2. Cleaned User Schema
// ---------------------------------------------------------
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  otp: { type: String },
  otpExpiry: { type: Date },
  password: { type: String, minlength: 6 },
  isVerified: { type: Boolean, default: false },
  googleId: { type: String, sparse: true },
  appleId: { type: String, sparse: true },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'apple'],
    default: 'local'
  },
  calendar: [CalendarEventSchema],
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student'
  },

  professorClassCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  classCodeEnteredAt: {
    type: Date,
    default: null
  },
  classCodeDiscountAvailed: {
    type: Boolean,
    default: false
  },

  // ✅ Ab sirf aik object hai, alag alag fields nahi
  subscription: {
    type: subscriptionSchema,
    default: () => ({}) // Default empty object taaki defaults (free/active) trigger hon
  },

  billing_address: billingAddressSchema,

}, { timestamps: true });

// ---------------------------------------------------------
// 3. Logic Updated to target `this.subscription`
// ---------------------------------------------------------
userSchema.pre('save', function (next) {
  // Check if subscription plan is modified or user is new
  // Note: Nested fields k liye 'subscription.plan_id' check krna hota hai
  if (this.isNew || this.isModified('subscription.transaction_id') || this.isModified('subscription.plan_id')) {

    const HOUR_IN_SECONDS = 3600;

    // Logic ab subscription object ke andar se data le rahi hai
    switch (this.subscription.plan_id) {
      case 'free':
        this.subscription.availableSeconds = 3 * HOUR_IN_SECONDS;
        break;
      case 'basic_plan':
        this.subscription.availableSeconds = 20 * HOUR_IN_SECONDS;
        break;
      case 'pro_plan':
        this.subscription.availableSeconds = 100 * HOUR_IN_SECONDS;
        break;
      case 'KBASSUB15':
        this.subscription.availableSeconds = 20 * HOUR_IN_SECONDS;
        break;
      case 'KPROSUB20':
        this.subscription.availableSeconds = 100 * HOUR_IN_SECONDS;
        break;
      case 'nickel_test':
        this.subscription.availableSeconds = 0.001667 * HOUR_IN_SECONDS;
        break;
      case 'penny_test':
        this.subscription.availableSeconds = 0.002778 * HOUR_IN_SECONDS;
        break;
      default:
        this.subscription.availableSeconds = 3 * HOUR_IN_SECONDS;
    }

    // Status update logic
    if (!this.isNew) {
      this.subscription.status = 'active';
    }
  }
  next();
});

// Password Hashing
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password ?? '');
};

// ---------------------------------------------------------
// 4. Methods Updated to use `this.subscription`
// ---------------------------------------------------------

userSchema.methods.deductSeconds = function (secondsToDeduct) {
  if (secondsToDeduct <= 0) return this;

  // Available seconds ab subscription object me hain
  this.subscription.availableSeconds = Math.max(0, this.subscription.availableSeconds - secondsToDeduct);

  // Status logic
  if (this.subscription.availableSeconds <= 0 && this.subscription.plan_id !== 'pro_plan' && this.subscription.plan_id !== 'KPROSUB20') {
    this.subscription.status = 'completed';
  }

  return this.save();
};

userSchema.methods.canUseService = function (secondsNeeded = 60) {
  const available = Number(this.subscription.availableSeconds || 0);
  const needed = Number(secondsNeeded);

  console.log('--- Check Limit ---');
  console.log('Plan:', this.subscription.plan_id);
  console.log('Status:', this.subscription.status);
  console.log('Available Sec:', available);
  console.log('Comparison:', available >= needed);
  console.log('Needed Sec:', needed);
  console.log('-------------------');

  if (this.subscription.plan_id === 'free') {
    return available >= needed;
  } else if (this.subscription.plan_id === 'basic_plan' || this.subscription.plan_id === 'KBASSUB15') {
    return available >= needed && this.subscription.status === 'active';
  } else if (this.subscription.plan_id === 'pro_plan' || this.subscription.plan_id === 'KPROSUB20') {
    return available >= needed && this.subscription.status === 'active';
  } else if (this.subscription.plan_id === 'nickel_test') {
    return available >= needed && this.subscription.status === 'active';
  } else if (this.subscription.plan_id === 'penny_test') {
    return available >= needed && this.subscription.status === 'active';
  }
  return false;
};

userSchema.methods.getSubscriptionInfo = function () {
  const hoursLeft = Math.max(0, this.subscription.availableSeconds / 3600);
  const formattedHours = parseFloat(hoursLeft.toFixed(2));

  return {
    type: this.subscription.plan_id.split('_')[0],          // ✅ Updated
    status: this.subscription.status,         // ✅ Updated
    availableHours: formattedHours,
    availableSeconds: this.subscription.availableSeconds, // ✅ Updated
    source: this.subscription.source,         // ✅ Updated
    lastPaymentDate: this.subscription.last_payment_date || this.subscription.createdAt,
  };
};

export default mongoose.model('User', userSchema);
