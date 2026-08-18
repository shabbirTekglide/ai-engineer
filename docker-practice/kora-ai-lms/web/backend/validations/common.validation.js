import { z } from 'zod';
// Generic ObjectId validator
export const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId format');

export const objectIdParam = (paramName = 'id') => {
  return z.object({
    [paramName]: objectIdSchema
  });
};


// For multiple parameters
export const multipleObjectIdParams = (paramNames) => {
  const schemaObject = {};
  const params = Array.isArray(paramNames) ? paramNames : [paramNames];

  params.forEach(paramName => {
    schemaObject[paramName] = objectIdSchema;
  });

  return z.object(schemaObject);
};

// Pre-defined common schemas for convenience
export const commonParamSchemas = {
  eventId: objectIdParam('eventId'),
  classId: objectIdParam('classId'),
  lectureId: objectIdParam('lectureId'),
  userId: objectIdParam('userId'),
  classAndLecture: multipleObjectIdParams(['classId', 'lectureId']),
};
// export const objectIdParam = z.object({
//   classId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId'),
// });

// middleware/validate.js
export const validateParams = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.params ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return res.status(400).json({ message: 'Validation failed', errors: issues });
  }
  req.validParams = parsed.data;
  next();
};

export const lectureQuerySchema = z.object({
  classId: objectIdSchema,
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
  status: z.enum(['all', 'completed', 'processing', 'failed', 'pending']).optional().default('all'),
});