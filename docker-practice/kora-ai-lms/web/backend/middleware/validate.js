// middleware/validate.js
export const validateBody = (schema) => (req, res, next) => {
  const hasBodyMethod = ["POST", "PUT", "PATCH"].includes(req.method);
  if (!hasBodyMethod) return next();

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const errors = parsed.error.issues.map(i => `${i.message}`);
    return res.status(400).json({ message: "Validation failed", errors });
  }
  req.validated = parsed.data;
  next();
};

export const validateParams = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.params ?? {});
  if (!parsed.success) {
    const errors = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
    return res.status(400).json({ message: "Validation failed", errors });
  }
  req.validParams = parsed.data;
  next();
};
