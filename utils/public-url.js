// Normalize a stored file path (e.g. "uploads\\attachments\\x.png", "./uploads/x.png")
// into a web path like "/uploads/attachments/x.png". Absolute http(s) URLs are returned unchanged.
export function normalizeUploadPath(value) {
  if (!value || typeof value !== 'string') return value;
  if (/^https?:\/\//i.test(value)) return value;
  let p = value.replace(/\\/g, '/').replace(/^\.\//, '');
  const idx = p.indexOf('uploads/');
  if (idx !== -1) p = p.slice(idx);
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

// Turn a stored upload path into a fully-qualified URL the frontend can load.
export function toPublicUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') return value;
  if (/^https?:\/\//i.test(value)) return value;
  const p = normalizeUploadPath(value);
  if (!p.startsWith('/uploads/')) return p;
  return `${String(baseUrl || '').replace(/\/$/, '')}${p}`;
}
