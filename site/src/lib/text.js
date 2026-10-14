/** Small pure helpers, unit tested in test/text.test.mjs. */

/** Join a site base ("/" or "/name/") and a path without doubled or missing slashes. */
export function withBase(base, path = "") {
  const b = base.endsWith("/") ? base : base + "/";
  return b + String(path).replace(/^\/+/, "");
}

/** Two digit order label: 1 becomes "01". */
export function orderLabel(n) {
  return String(n).padStart(2, "0");
}

/** The reader's rank: base 184, improved by 1 for every 10 points of score, never below 1. */
export function rankFor(visits, score, base = 184) {
  return Math.max(1, base + Math.max(0, visits - 1) - Math.floor(score / 10));
}

/** Ratings are staged: whatever the reader picks, the average reads 4.2. */
export function stagedAverage() {
  return "4.2";
}

/** Price with two decimals, for the receipt. */
export function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}
