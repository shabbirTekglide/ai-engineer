export function sanitize(s) {
  return String(s)
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, '-') // allow nested folders + safe chars
    .replace(/-+/g, '-')
    .slice(0, 120);
}