import mongoose from 'mongoose';

const referenceCodeSubscriptionEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  referenceCodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReferenceCode',
    required: true,
    index: true
  },
  referenceCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  planId: {
    type: String,
    required: true,
    trim: true
  },
  eventType: {
    type: String,
    enum: ['initial', 'renewal', 'resubscribe'],
    default: 'initial'
  },
  source: {
    type: String,
    default: 'unknown',
    trim: true
  },
  sourceTransactionId: {
    type: String,
    default: null,
    sparse: true,
    index: true
  },
  subscriptionId: {
    type: String,
    default: null,
    trim: true
  },
  occurredAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

referenceCodeSubscriptionEventSchema.index({ referenceCode: 1, occurredAt: -1 });
referenceCodeSubscriptionEventSchema.index(
  { sourceTransactionId: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model('ReferenceCodeSubscriptionEvent', referenceCodeSubscriptionEventSchema);
