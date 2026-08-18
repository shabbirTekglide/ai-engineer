import mongoose from "mongoose";

const UsageLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'User.subscription', index: true },
  service: { type: String, required: true, index: true },
  model: { type: String, required: true },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  characters: { type: Number, default: 0 },
  audioSeconds: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

export default mongoose.model('UsageLog', UsageLogSchema);


