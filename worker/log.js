// The only way Worker code writes logs. Every string is scrubbed of anything
// shaped like a credential (long unbroken token runs), so a key cannot reach
// Workers Logs or `wrangler tail` even if it ends up inside an error message.
const TOKEN_LIKE = /[A-Za-z0-9_\-+/=.]{24,}/g;

export function scrub(value) {
  if (typeof value === "string") return value.replace(TOKEN_LIKE, "[redacted]");
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
  return value;
}

export function logError(fields) {
  console.error(JSON.stringify(scrub(fields)));
}

export function logWarning(fields) {
  console.warn(JSON.stringify(scrub(fields)));
}
