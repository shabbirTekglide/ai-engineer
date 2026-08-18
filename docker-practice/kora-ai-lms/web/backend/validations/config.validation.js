import { z } from 'zod';

// Schema for a single integration model entry
export const integrationModelSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  apiKey: z.string().min(1, 'apiKey is required').max(1024),
});

// Request body when adding a new model
export const addModelBody = z.object({
  name: z.string().min(1, 'name is required').max(100),
  apiKey: z.string().min(1, 'apiKey is required').max(1024),
});

// Request body when updating global settings
export const updateGlobalBody = z.object({
  translation: z
    .object({ modelName: z.string().min(1), apiKey: z.string().min(1) })
    .optional(),
  aiIntegration: z
    .object({ modelName: z.string().min(1), apiKey: z.string().min(1) })
    .optional(),
  models: z.array(integrationModelSchema).optional(),
});

// Express middleware factory to validate request bodies
export const validateBody = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse(req.body);
    req.body = parsed; // replace with parsed/typed
    return next();
  } catch (err) {
    const errors = err.errors ? err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })) : [{ message: err.message }];
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
};

export default null;
