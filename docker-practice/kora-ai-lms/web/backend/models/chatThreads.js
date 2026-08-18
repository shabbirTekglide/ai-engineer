// models/chat-thread.js
import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema({
  role:    { type: String, enum: ["user","assistant","system"], required: true },
  content: { type: String, required: true },
  // optional: store IDs of cited flashcards/quizzes/guides later
  citations: [{ type: String }]
}, { timestamps: true, _id: true });

const ChatThreadSchema = new mongoose.Schema({
  ownerId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
  context:   { type: String, enum: ["general","class","lecture"], default: "general", index: true },
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: "Class" },
  lectureId: { type: mongoose.Schema.Types.ObjectId, ref: "Lecture" },
  title:     String,
  messages:  [ChatMessageSchema],
  // OpenAI Responses API - store last response ID for conversation continuity
  // This enables stateful conversations with 40-80% better cache utilization
  lastResponseId: { type: String, default: null }
}, { timestamps: true });

ChatThreadSchema.index({ ownerId: 1, updatedAt: -1 });

export default mongoose.model("ChatThread", ChatThreadSchema);
