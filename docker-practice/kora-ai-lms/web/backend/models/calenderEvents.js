// models/calendar-event.js
import mongoose from "mongoose";

export const CalendarEventSchema = new mongoose.Schema({
  classId:    { type: mongoose.Schema.Types.ObjectId, ref: "Class", index: true },
  title:       { type: String, required: true },
  start:       { type: Date, required: true, index: true },
  end:         { type: Date, required: true, index: true },
  type:        { type: String, required: true, default:"class" },
  class:       { type: String, required: true},
  location:    {type: String},
  reminders:   [{ minutesBefore: Number }],
  origin:         { type: String, enum: ["manual", "syllabus"], default: "manual", index: true },
  importGroupId:  { type: String, index: true },
}, { timestamps: true });
