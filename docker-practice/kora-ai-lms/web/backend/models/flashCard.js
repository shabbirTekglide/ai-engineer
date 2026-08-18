import mongoose from "mongoose";

const CardSchema = new mongoose.Schema({
  term:        { type: String, required: true, trim: true },
  definition:  { type: String, required: true, trim: true },
  hint:        { type: String, trim: true },
}, { _id: false });

export const FlashcardSetSchema = new mongoose.Schema({
  cards:     { type: [CardSchema], default: [] }
}, { timestamps: true });


