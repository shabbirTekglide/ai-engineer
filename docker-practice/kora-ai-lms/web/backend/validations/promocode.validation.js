import { z } from 'zod';

export const promoCodeSchema = z.object({
  code: z.string().min(1, 'Promo code is required').trim().toUpperCase(),
  description: z.string().optional().default(''),
  expiryDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).transform((val) => new Date(val))
    .refine((val) => val > new Date(), {
      message: "Expiry date must be in the future",
    }),
  eligibleUsers: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid User ID")).optional().default([]),
  maxUsagePerUser: z.number().int().min(1).optional().default(1),
  applicablePlan: z.enum(['free', 'basic_plan', 'pro_plan', 'all']).optional().default('all'),
  isActive: z.boolean().optional().default(true),
});

export const updatePromoCodeSchema = promoCodeSchema.partial().extend({
  // Expiry date for update also needs to be in future if provided
  expiryDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).transform((val) => new Date(val))
    .refine((val) => val > new Date(), {
      message: "Expiry date must be in the future",
    }).optional(),
});

export const applyPromoCodeSchema = z.object({
  code: z.string().min(1, 'Promo code is required').trim().toUpperCase(),
  plan: z.enum(['free', 'basic_plan', 'pro_plan', 'all']).optional().default('all'),
});