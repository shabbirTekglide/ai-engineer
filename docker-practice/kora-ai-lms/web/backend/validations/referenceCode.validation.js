import { z } from 'zod';

const expiryDateSchema = z.preprocess(
  (value) => {
    if (value === '' || value === undefined) return null;
    return value;
  },
  z.union([
    z.null(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be in YYYY-MM-DD format')
  ])
).transform((value, ctx) => {
  if (value === null) return null;

  const date = new Date(`${value}T23:59:59.999Z`);

  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid expiry date'
    });
    return z.NEVER;
  }

  return date;
});

export const referenceCodeSchema = z.object({
  code: z.string()
    .min(1, 'Reference code is required')
    .max(40, 'Reference code must be less than 40 characters')
    .trim()
    .refine((value) => !/\s/.test(value), 'Reference code cannot contain spaces')
    .toUpperCase(),
  description: z.string().optional().default(''),
  professorFirstName: z.string()
    .min(1, 'Professor first name is required')
    .max(60, 'Professor first name must be less than 60 characters')
    .trim(),
  professorLastName: z.string()
    .min(1, 'Professor last name is required')
    .max(60, 'Professor last name must be less than 60 characters')
    .trim(),
  semester: z.string()
    .min(1, 'Semester is required')
    .max(80, 'Semester must be less than 80 characters')
    .trim(),
  assignedUsers: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid User ID')).optional().default([]),
  isActive: z.boolean().optional().default(true),
  expiresAt: expiryDateSchema.optional(),
});

export const updateReferenceCodeSchema = referenceCodeSchema.partial();
