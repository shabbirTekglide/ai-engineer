// // validators/calendarValidators.js
// import { z } from 'zod';

// // Base reminder schema
// const reminderSchema = z.object({
//   minutesBefore: z.number().int().positive().max(10080) // Max 7 days in minutes
// });

// // Base calendar event schema
// export const calendarEventSchema = z.object({
//   title: z.string()
//     .min(1, "Title is required")
//     .max(200, "Title must be less than 200 characters")
//     .trim(),

//   start: z.string()
//     .datetime("Start date must be a valid ISO date string")
//     .or(z.date())
//     .refine((val) => new Date(val) > new Date(), {
//       message: "Start date must be in the future"
//     }),

//   end: z.string()
//     .datetime("End date must be a valid ISO date string")
//     .or(z.date()),

//   type: z.enum(['class', 'study', 'lab', 'exam', 'assignment', 'personal'], {
//     errorMap: () => ({ message: "Type must be one of: class, study, lab, exam, assignment, personal" })
//   }).default('class'),

//   class: z.string()
//     .min(1, "Class name is required")
//     .max(100, "Class name must be less than 100 characters")
//     .trim(),

//   location: z.string()
//     .max(200, "Location must be less than 200 characters")
//     .trim()
//     .optional()
//     .or(z.literal('')),

//   reminders:
//     z.array(reminderSchema).
//       max(5, "Maximum 5 reminders allowed")
//       .default([])
// })
//   .refine((data) => {
//     const start = new Date(data.start);
//     const end = new Date(data.end);
//     return end > start;
//   }, {
//     message: "End date must be after start date",
//     path: ["end"]
//   });

// // Schema for creating events
// export const createEventSchema = calendarEventSchema;

// // Schema for updating events (all fields optional)
// export const updateEventSchema = calendarEventSchema
//   // .omit({ classId: true }) // Remove classId from required base schema
//   // .extend({
//   //   classId: z.string()
//   //     .min(1, "Class ID must be a valid string")
//   //     .max(100, "Class ID must be less than 100 characters")
//   //     .trim()
//   //     .optional()
//   // })
//   .partial() // Make all fields optional
//   .refine((data) => {
//     // At least one field should be provided for update
//     return Object.keys(data).length > 0;
//   }, {
//     message: "At least one field must be provided for update"
//   })
//   .refine((data) => {
//     // If both start and end are provided, validate the order
//     if (data.start && data.end) {
//       const start = new Date(data.start);
//       const end = new Date(data.end);
//       return end > start;
//     }
//     return true;
//   }, {
//     message: "End date must be after start date",
//     path: ["end"]
//   });

// // Schema for event ID in params
// export const eventIdSchema = z.object({
//   eventId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid event ID format")
// });

// // Schema for date range queries
// export const dateRangeSchema = z.object({
//   startDate: z.string()
//     .datetime("Start date must be a valid ISO date string"),
//   endDate: z.string()
//     .datetime("End date must be a valid ISO date string")
// })
//   .refine((data) => {
//     const start = new Date(data.startDate);
//     const end = new Date(data.endDate);
//     return end > start;
//   }, {
//     message: "End date must be after start date",
//     path: ["endDate"]
//   });

// // Schema for query parameters with optional date range
// export const eventsQuerySchema = z.object({
//   startDate: z.string()
//     .datetime("Start date must be a valid ISO date string")
//     .optional(),
//   endDate: z.string()
//     .datetime("End date must be a valid ISO date string")
//     .optional()
// })
//   .refine((data) => {
//     // If both dates are provided, validate the range
//     if (data.startDate && data.endDate) {
//       const start = new Date(data.startDate);
//       const end = new Date(data.endDate);
//       return end > start;
//     }
//     return true;
//   }, {
//     message: "End date must be after start date when both are provided",
//     path: ["endDate"]
//   });

// validators/calendarValidators.js
import { z } from 'zod';

// Base reminder schema
const reminderSchema = z.object({
  minutesBefore: z.number().int().positive() // Max limit removed for 3 weeks
});

// Reusable field schemas
const titleSchema = z.string()
  .min(1, "Title is required")
  .max(200, "Title must be less than 200 characters")
  .trim();

const startSchema = z.union([
  z.string().datetime("Start date and time must be a valid ISO date string"),
  z.date()
]).refine((val) => new Date(val) > new Date(), {
  message: "Start date and time must be in the future"
});

const endSchema = z.union([
  z.string().datetime("End date must be a valid ISO date string"),
  z.date()
]);

const typeSchema = z.enum(
  ['class', 'study', 'lab', 'exam', 'assignment', 'personal'],
  {
    errorMap: () => ({
      message: "Type must be one of: class, study, lab, exam, assignment, personal"
    })
  }
).default('class');

const classSchema = z.string()
  .min(1, "Class name is required")
  .max(100, "Class name must be less than 100 characters")
  .trim();

const locationSchema = z.string()
  .max(200, "Location must be less than 200 characters")
  .trim()
  .optional()
  .or(z.literal(''));

const remindersSchema = z.array(reminderSchema)
  .max(5, "Maximum 5 reminders allowed")
  .default([]);

// Base OBJECT schema only
const calendarEventBaseSchema = z.object({
  title: titleSchema,
  start: startSchema,
  end: endSchema,
  type: typeSchema,
  class: classSchema,
  location: locationSchema,
  reminders: remindersSchema
});

// Create schema
export const calendarEventSchema = calendarEventBaseSchema.refine((data) => {
  const start = new Date(data.start);
  const end = new Date(data.end);
  return end > start;
}, {
  message: "End date and time must be after start date and time",
  path: ["end"]
});

// Schema for creating events
export const createEventSchema = calendarEventSchema;

// Schema for updating events (all fields optional)
export const updateEventSchema = calendarEventBaseSchema
  .partial()
  .refine((data) => {
    return Object.keys(data).length > 0;
  }, {
    message: "At least one field must be provided for update"
  })
  .refine((data) => {
    if (data.start && data.end) {
      const start = new Date(data.start);
      const end = new Date(data.end);
      return end > start;
    }
    return true;
  }, {
    message: "End date and time must be after start date and time",
    path: ["end"]
  });

// Schema for event ID in params
export const eventIdSchema = z.object({
  eventId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid event ID format")
});

// Schema for date range queries
export const dateRangeSchema = z.object({
  startDate: z.string()
    .datetime("Start date and time must be a valid ISO date string"),
  endDate: z.string()
    .datetime("End date and time must be a valid ISO date string")
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end > start;
}, {
  message: "End date and time must be after start date and time",
  path: ["endDate"]
});

// Schema for query parameters with optional date range
export const eventsQuerySchema = z.object({
  startDate: z.string()
    .datetime("Start date and time must be a valid ISO date string")
    .optional(),
  endDate: z.string()
    .datetime("End date and time must be a valid ISO date string")
    .optional()
}).refine((data) => {
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return end > start;
  }
  return true;
}, {
  message: "End date and time must be after start date and time when both are provided",
  path: ["endDate"]
});