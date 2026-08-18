import mongoose from "mongoose";

const settingSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    notificationEnabled: {
        type: Boolean,
        default: true
    },
    studyReminders: {
      type: Boolean,
      default: true
    },
}, {timestamps: true})

settingSchema.index({ userId: 1 });

export const Setting = mongoose.model("Setting", settingSchema);