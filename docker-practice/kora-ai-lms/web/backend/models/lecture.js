// models/lecture.js
import mongoose from "mongoose";
import { QuizSchema } from "./quiz.js";
import { FlashcardSetSchema } from "./flashCard.js";
import { deleteAudioFromS3 } from "../services/lectureUploader.js";

const ChunkSchema = new mongoose.Schema({
  t0: Number,                 // start sec
  t1: Number,                 // end sec
  speaker: String,                 // optional diarization label
  text: { type: String, trim: true },
  tokens: Number,
  embedding: { type: [Number], default: [], index: false }  // vector (e.g., 1536 dims)
}, { _id: false });

// Define the TranscriptSchema as a subdocument schema
const TranscriptSchema = new mongoose.Schema({
  language: { type: String, default: "en" },
  wordCount: Number,
  text: { type: String },        // embedded chunks w/ vectors
  asr: {
    provider: String,
    model: String,
    durationMs: Number
  },
  sourceHash: String                // hash of the audio used to generate this
}, { _id: true, timestamps: true }); // Keep _id and timestamps for transcript

const LectureNotesSchema = new mongoose.Schema({
  overview: String,
  prompts: [String],
  sourceHash: String
}, { timestamps: true });

const StudyGuideSchema = new mongoose.Schema({
  content: String,  // Full HTML study guide
  sourceHash: String   // Hash of transcript used to generate
}, { timestamps: true });

const LectureSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", index: true, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },
  title: { type: String, required: true, trim: true },
  recordedAt: { type: Date, default: Date.now },
  durationSec: Number,
  audioUrl: { type: String }, // Cloudinary CDN URL for streaming/fetching audio
  cloudinaryPublicId: { type: String }, // Full public ID including folder path for Cloudinary
  cloudinaryAssetId: { type: String }, // Cloudinary's unique asset identifier
  // Legacy fields - kept for backward compatibility with existing data
  localAudioPath: { type: String }, // [LEGACY] Local file system path
  relativeAudioPath: { type: String }, // [LEGACY] Relative path for serving
  processingStatus: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending"
  },
  sourceType: {
    type: String,
    enum: ["audio", "document", "text", "youtube", "video"],
    default: "audio",
    index: true
  },

  sourceFile: {
    url: String,
    publicId: String,
    assetId: String,
    mimeType: String,
    originalName: String,
    sizeBytes: Number,
    extension: String
  },

  documentMeta: {
    documentType: {
      type: String,
      enum: ["notes", "slides", "handout", "assignment", "other"],
      default: "other"
    },
    pageCount: Number,
    wordCount: Number
  },
  processingError: String,
  transcript: TranscriptSchema,
  notes: LectureNotesSchema,
  studyGuide: StudyGuideSchema,
  quiz: QuizSchema,
  flashCards: FlashcardSetSchema,

}, { timestamps: true });

LectureSchema.index({ ownerId: 1, classId: 1, recordedAt: -1 });

export default mongoose.model("Lecture", LectureSchema);
