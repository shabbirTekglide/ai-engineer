// models/quiz.js
import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  question:     { type: String, required: true },
  options:      [{ type: String, required: true }],
  correctIndex: { type: Number, required: true },
  hint:  { type: String, required: true },
  explanation:  String
}, { _id: false });

export const QuizSchema = new mongoose.Schema({
  title:     { type: String, trim: true },
  questions: [QuestionSchema]
}, { timestamps: true });


