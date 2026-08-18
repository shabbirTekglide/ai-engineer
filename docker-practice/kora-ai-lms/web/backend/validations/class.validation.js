// validations/class.validation.js
import { z } from "zod";

// For FormData, we need to handle string values since FormData sends everything as strings
export const createClassSchema = z.object({
  className: z.string().min(2).max(120),
  term: z.string().regex(/^(fall|spring|summer|winter)-\d{4}$/i).optional().or(z.literal("")),
  color: z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().min(0).max(100)).optional(),
  instructor: z.string().max(100).optional().or(z.literal("")),
  meetingDays: z.string().transform(val => {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }).pipe(z.array(
    z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
  )),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  events: z.string().transform(val => {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }).optional(),
}).refine((d) => {
  // If either time exists, both must exist and end > start
  const hasStart = !!d.startTime && d.startTime !== "";
  const hasEnd = !!d.endTime && d.endTime !== "";
  if (hasStart !== hasEnd) return false;
  if (hasStart && hasEnd) {
    const [sh, sm] = d.startTime.split(":").map(Number);
    const [eh, em] = d.endTime.split(":").map(Number);
    return (eh * 60 + em) > (sh * 60 + sm);
  }
  return true;
}, { message: "Invalid time range: provide both startTime and endTime, and end must be after start." });

// Update schema - all fields optional, handles JSON (not FormData)
export const updateClassSchema = z.object({
  className: z.string().min(2).max(120).optional(),
  term: z.string().regex(/^(fall|spring|summer|winter)-\d{4}$/i).optional().or(z.literal("")),
  color: z.union([
    z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().min(0).max(100)),
    z.number().int().min(0).max(100)
  ]).optional(),
  instructor: z.string().max(100).optional().or(z.literal("")),
  meetingDays: z.union([
    z.string().transform(val => {
      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    }).pipe(z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]))),
    z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]))
  ]).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
}).refine((d) => {
  // If either time exists, both must exist and end > start
  const hasStart = !!d.startTime && d.startTime !== "";
  const hasEnd = !!d.endTime && d.endTime !== "";
  if (hasStart !== hasEnd) return false;
  if (hasStart && hasEnd) {
    const [sh, sm] = d.startTime.split(":").map(Number);
    const [eh, em] = d.endTime.split(":").map(Number);
    return (eh * 60 + em) > (sh * 60 + sm);
  }
  return true;
}, { message: "Invalid time range: provide both startTime and endTime, and end must be after start." });