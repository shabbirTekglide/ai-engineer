import { z } from 'zod';

// Student Profile Validation Schema
export const studentProfileSchema = z.object({
  name: z.string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  
  school: z.string()
    .min(2, "School name must be at least 2 characters")
    .max(200, "School name must be less than 200 characters")
    .trim(),
    classYear: z.string()
    .min(4, "Class year must be exactly 4 digits")
    .max(4, "Class year must be exactly 4 digits")
    .regex(/^\d{4}$/, "Class year must be a valid 4-digit year")
    .refine((val) => {
      const year = parseInt(val);
      const currentYear = new Date().getFullYear();
      return year >= 1900 && year <= currentYear + 10; // Allow up to 10 years in future
    }, "Class year must be between 1900 and " + (new Date().getFullYear() + 10)),
  
dateOfBirth: z
  .string()
  .optional()
  .transform((val) => {
    // FIX 1: Agar value khali ya undefined hai, to undefined hi return kro
    if (!val) return undefined;
    return new Date(`${val}T00:00:00`);
  })
  .refine((date) => {
    // FIX 2: Agar date undefined hai (optional case), to error mat do
    if (!date) return true;
    
    // Baqi validation wesi hi rahegi
    return !Number.isNaN(date.getTime()) && date < new Date();
  }, {
    message: "Date of birth must be a valid past date",
  }),
  
  phone: z.string()
    .regex(/^\+?[\d\s\-()]{10,}$/, "Please enter a valid phone number")
    .optional()
    .or(z.literal('')),

  professorClassCode: z.string()
    .max(40, "Professor/Class Code must be less than 40 characters")
    .optional()
    .or(z.literal(''))
});

// Partial schema for updates (all fields optional)
export const updateStudentProfileSchema = studentProfileSchema.partial();
