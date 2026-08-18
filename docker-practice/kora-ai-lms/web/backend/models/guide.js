// models/guide.js
import mongoose from "mongoose";

const SectionSchema = new mongoose.Schema({
  heading: String,
  body:    String
}, { _id: false });

const GuideSchema = new mongoose.Schema({
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: "Class", index: true },
  lectureId: { type: mongoose.Schema.Types.ObjectId, ref: "Lecture", index: true },
  title:     { type: String, trim: true },
  sections:  [SectionSchema]
}, { timestamps: true });

GuideSchema.index({ ownerId: 1, classId: 1, lectureId: 1 });

export default mongoose.model("Guide", GuideSchema);
