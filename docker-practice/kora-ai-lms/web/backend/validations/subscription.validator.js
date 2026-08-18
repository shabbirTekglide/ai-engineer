import { z } from 'zod';

export const subscriptionSchema = z.object({
    first_name: z.string().optional().default('john'),
    last_name: z.string().optional().default('Doe'),
    email: z.string().optional().default('john.doe@example.com'),
    payment_token: z.string().min(1, "Payment token is required")
});
