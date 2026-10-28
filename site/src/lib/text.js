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

/** Every staged price names its currency. The gallery sells nothing, and the pipeline cap is in the same unit. */
export function usd(amount) {
  return `USD ${money(Number(amount))}`;
}

/** A staged price as a reader sees it: Free, or an amount with its currency. */
export function priceLabel(price) {
  return /^\d/.test(price) && Number(price) > 0 ? usd(price) : "Free";
}

/** Staged starting view counts. Plausible, formatted, and the same on the server, with JavaScript off, and under reduced motion. */
export const VIEW_BASE = { "the-still": 1204331, "the-certificate": 388902 };

/** Thousands separators, fixed to en-US so output never depends on the reader's locale. */
export function formatCount(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
