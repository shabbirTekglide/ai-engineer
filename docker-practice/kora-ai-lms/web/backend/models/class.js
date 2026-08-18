// models/class.js
import mongoose from "mongoose";

const ALLOWED_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// HH:MM 24h
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// e.g. "10:00-11:15"
const TIME_RANGE_12H_RE = /^(0?[1-9]|1[0-2]):[0-5]\d\s(AM|PM)\s*-\s*(0?[1-9]|1[0-2]):[0-5]\d\s(AM|PM)$/;
// e.g. "fall-2025", "spring-2026"
const TERM_RE = /^(fall|spring|summer|winter)-\d{4}$/i;

const ClassSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    
    lectureNo:{
      type: Number,
      default: 0,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },

    // computed, case-insensitive uniqueness per owner
    nameKey: {
      type: String,
      required: true,
      index: true,
    },

    term: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || TERM_RE.test(v),
        message:
          "term must look like 'fall-2025', 'spring-2026', 'summer-2026', or 'winter-2026'",
      },
    },

    meetingDays: {
      type: [String],
      validate: {
        validator: (arr) =>
          !arr ||
          (Array.isArray(arr) &&
            arr.every((d) => ALLOWED_DAYS.includes(d)) &&
            new Set(arr).size === arr.length), // no dupes
        message:
          "meetingDays must be an array of unique values from Mon/Tue/Wed/Thu/Fri/Sat/Sun",
      },
      default: undefined, // avoid storing [] if not provided
    },

    // Store as "HH:MM-HH:MM" (we also check end > start below)
    meetingTime: {
      type: String,
      validate: {
        // Agar value empty hai to pass, warna Regex test karo
        validator: (v) => !v || TIME_RANGE_12H_RE.test(v),
        message: "meetingTime must look like '10:00 AM - 02:30 PM' (12h format)",
      },
    },

    // Slider 0..100 (you used this in UI); store as Number
    color: {
      type: Number,
      min: 0,
      max: 100,
      default: 86,
      required: true,
    },

    // Optional free text or URL (kept simple)
    syllabus: {
      type: String,
      trim: true,
      maxlength: 10_000,
    },
    
    instructor: {
      type: String,
      trim: true,
    },
    upcomingAssignments: {
      type: String,
      trim: true,
    },
  lastSyllabusImportId: { type: String, index: true },  // e.g., a UUID/ObjectId string
  lastSyllabusImportedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_, doc) {
        // don’t leak nameKey to clients
        delete doc.nameKey;
        return doc;
      },
    },
  },
  
);

// Case-insensitive unique per owner using normalized key
ClassSchema.index({ ownerId: 1, nameKey: 1 }, { unique: true });

ClassSchema.pre("validate", function (next) {
  // 1. Normalize nameKey
  if (this.name) {
    this.nameKey = String(this.name).trim().toLowerCase();
  }
  if (this.meetingTime) {
    if (TIME_RANGE_12H_RE.test(this.meetingTime)) {
      // Helper function: "02:30 PM" ko minutes mein convert karne ke liye
      const toMinutes = (timeStr) => {
        // String split karo: ["02:30", "PM"]
        const [time, period] = timeStr.trim().split(/\s+/);
        let [hours, minutes] = time.split(":").map(Number);

        // AM/PM Logic
        if (period === "PM" && hours !== 12) hours += 12; // 1 PM -> 13
        if (period === "AM" && hours === 12) hours = 0;   // 12 AM -> 0

        return hours * 60 + minutes;
      };

      // String ko beech ke hyphen "-" se todo
      const [startStr, endStr] = this.meetingTime.split("-");

      const startTotalMinutes = toMinutes(startStr);
      const endTotalMinutes = toMinutes(endStr);

      // Check: End time must be greater than Start time
      if (endTotalMinutes <= startTotalMinutes) {
        const err = new mongoose.Error.ValidationError(this);
        err.addError("meetingTime", new mongoose.Error.ValidatorError({
          message: "End time must be after start time",
        }));
        return next(err);
      }
    }
  }
  next();
});

export default mongoose.model("Class", ClassSchema);
