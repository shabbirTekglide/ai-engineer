import mongoose from 'mongoose';

const WebhookEventSchema = new mongoose.Schema({
  uuid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  processedAt: {
    type: Date,
    default: Date.now,
    // Automatically delete webhook records after 30 days
    expires: 30 * 24 * 60 * 60
  }
});

export default mongoose.model('WebhookEvent', WebhookEventSchema);
