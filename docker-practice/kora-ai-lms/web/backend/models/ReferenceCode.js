import mongoose from 'mongoose';

const referenceCodeSchema = new mongoose.Schema({
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
    default: '',
    trim: true
  },
  professorName: {
    type: String,
    required: true,
    trim: true
  },
  professorFirstName: {
    type: String,
    trim: true,
    default: ''
  },
  professorLastName: {
    type: String,
    trim: true,
    default: ''
  },
  semester: {
    type: String,
    required: true,
    trim: true
  },
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

referenceCodeSchema.index({ code: 1, isActive: 1 });
referenceCodeSchema.index({ professorFirstName: 1, professorLastName: 1, semester: 1 });
referenceCodeSchema.index({ assignedUsers: 1, isActive: 1 });

referenceCodeSchema.pre('save', function (next) {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase().trim();
  }
  next();
});

export default mongoose.model('ReferenceCode', referenceCodeSchema);
