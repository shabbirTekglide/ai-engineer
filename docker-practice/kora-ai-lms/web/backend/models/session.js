// models/session.js
import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
  userAgent:  String,
  ip:         String,
  location:   { country:String, region:String, city:String, lat:Number, lon:Number, tz:String },
  lastUsedAt: Date,
  revokedAt:  Date
}, { timestamps: true });

SessionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Session", SessionSchema);
