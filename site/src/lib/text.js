/** Small pure helpers, unit tested in test/text.test.mjs. */

/** Whole minutes to read, never below one. 220 words per minute. */
export function readingMinutes(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Join a site base ("/" or "/name/") and a path without doubled or missing slashes. */
export function withBase(base, path = "") {
  const b = base.endsWith("/") ? base : base + "/";
  return b + String(path).replace(/^\/+/, "");
}

/** Two digit order label: 1 becomes "01". */
export function orderLabel(n) {
  return String(n).padStart(2, "0");
}
