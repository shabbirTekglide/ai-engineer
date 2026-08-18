// models/StudentProfile.js
import mongoose from 'mongoose';

const studentProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  school: {
    type: String,
    required: true,
    trim: true
  },
  classYear: {
    type: String,
    required: true,
    trim: true
  },
  profilePic: {
    type: String,
    default: null
  },
  dateOfBirth: {
    type: Date
  },
  phone: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster queries
studentProfileSchema.index({ userId: 1 });
studentProfileSchema.index({ school: 1 });
studentProfileSchema.index({ classYear: 1 });

// Static method to find by user ID
studentProfileSchema.statics.findByUserId = function (userId) {
  return this.findOne({ userId });
};

export default mongoose.model('StudentProfile', studentProfileSchema);
