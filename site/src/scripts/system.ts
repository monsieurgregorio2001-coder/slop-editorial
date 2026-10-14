// The staged "system": local session state, HUD notices, motion preference.
// Nothing here leaves the device. There is no network call and no analytics.
import { rankFor, stagedAverage } from "../lib/text.js";

const KEY = "slop.session";
const BASE_SESSION = 184;

type Store = { visits: number; viewed: Record<string, number>; motion?: "reduce" | "auto"; sound?: boolean; cookies?: boolean; cart?: number; rated?: number; ratings?: number; score?: number };

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { visits: 1, viewed: {}, ...JSON.parse(raw) };
  } catch { /* storage may be blocked, the site renders without it */ }
  return { visits: 1, viewed: {} };
}
function write(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

let store = read();
let visitCounted = false;
const sessionSeen = new Set<string>();

export const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Count one visit per browser session (tab), not per page view. */
function countVisit() {
  if (visitCounted) return;
  visitCounted = true;
  try {
    if (sessionStorage.getItem("slop.visit")) return;
    sessionStorage.setItem("slop.visit", "1");
    store = read();
    if (localStorage.getItem(KEY)) store.visits += 1;
    write(store);
  } catch { /* ignore */ }
}

/** Effective reduced motion: the OS preference or the reader's explicit toggle. */
export function reducedMotion(): boolean {
  return document.documentElement.hasAttribute("data-rm");
}

export function applyMotionPreference() {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search).get("motion");
  if (q === "reduce" || q === "auto") { store = read(); store.motion = q; write(store); }
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  store = read();
  if (store.motion === "reduce") root.dataset.motion = "reduce"; else delete root.dataset.motion;
  if (mq.matches || store.motion === "reduce") root.setAttribute("data-rm", ""); else root.removeAttribute("data-rm");
  document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]").forEach((b) => {
    const on = reducedMotion();
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "Motion: reduced" : "Motion: full";
  });
}

export function toggleMotion() {
  store = read();
  store.motion = store.motion === "reduce" ? "auto" : "reduce";
  write(store);
  // An explicit toggle outranks a ?motion switch left in the address bar.
  try { const url = new URL(location.href); if (url.searchParams.has("motion")) { url.searchParams.delete("motion"); history.replaceState(history.state, "", url); } } catch { /* ignore */ }
  applyMotionPreference();
  notice(store.motion === "reduce" ? "Motion reduced." : "Motion restored.");
}

/** The reader's score. Staged, local, and it only goes up: attention is a metric here. */
export function score(delta = 0): number {
  if (delta) { store = read(); store.score = Math.min(400, (store.score ?? 0) + delta); write(store); refreshId(); }
  return read().score ?? 0;
}
export function rank(): number { store = read(); return rankFor(store.visits, score(), BASE_SESSION); }
function refreshId() {
  const id = document.querySelector<HTMLElement>("[data-hud-id]");
  if (id) id.textContent = `You: #${rank()} today`;
}

/** The prompt pack cart. A number in this browser, nothing is sold. */
export function cart(delta = 0): number {
  store = read();
  if (delta) { store.cart = Math.max(0, (store.cart ?? 0) + delta); write(store); }
  const n = store.cart ?? 0;
  document.querySelectorAll<HTMLElement>("[data-cart]").forEach((el) => { el.textContent = String(n); });
  return n;
}

/** Ratings. Whatever the reader picks, the tally comes out the same. */
export function rate(stars: number): { avg: string; n: number } {
  store = read();
  store.rated = stars; store.ratings = (store.ratings ?? 184) + 1; write(store);
  return { avg: stagedAverage(), n: store.ratings };
}
export function rated(): number { return read().rated ?? 0; }

/** A system dialog. Resolves with the id of the button pressed. */
export function dialog(o: { title: string; body: string; buttons: Array<{ id: string; label: string; primary?: boolean }>; bar?: boolean }): Promise<string> {
  const host = document.querySelector("[data-dialog-host]");
  if (!host) return Promise.resolve("");
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "dialog"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", o.title);
    el.innerHTML = `<div class="dialog__box"><h2></h2><p></p>${o.bar ? '<div class="dialog__bar" role="progressbar" aria-label="Installing"><i></i></div>' : ""}<div class="dialog__row"></div></div>`;
    el.querySelector("h2")!.textContent = o.title; el.querySelector("p")!.textContent = o.body;
    const row = el.querySelector(".dialog__row")!;
    o.buttons.forEach((b) => { const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn" + (b.primary ? " btn--primary" : ""); btn.textContent = b.label; btn.addEventListener("click", () => { el.remove(); resolve(b.id); }); row.append(btn); });
    host.append(el);
    (row.querySelector("button:last-child") as HTMLElement | null)?.focus();
  });
}

/** Cookie sheet: both buttons accept and nothing is set beyond this flag. */
export function cookieSheet(delayMs: number) {
  const sheet = document.querySelector<HTMLElement>("[data-cookies]");
  if (!sheet || read().cookies) return;
  if (sheet.dataset.bound !== "1") {
    sheet.dataset.bound = "1";
    sheet.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", () => {
      store = read(); store.cookies = true; write(store);
      sheet.removeAttribute("data-on");
      window.setTimeout(() => { sheet.hidden = true; }, 650);
      notice("Preferences saved. Measurement continues.");
      document.dispatchEvent(new CustomEvent("slop:consent"));
    }));
  }
  window.setTimeout(() => { if (!read().cookies) { sheet.hidden = false; requestAnimationFrame(() => sheet.setAttribute("data-on", "")); } }, reducedMotion() ? 0 : delayMs);
}
export function consented(): boolean { return !!read().cookies; }

let noticeTimer: number | undefined;
export const shown: string[] = [];
export function notice(text: string, opts: { once?: string } = {}) {
  if (opts.once) {
    if (sessionSeen.has(opts.once)) return;
    sessionSeen.add(opts.once);
  }
  shown.push(text);
  (window as unknown as { __notices: string[] }).__notices = shown;
  const el = document.querySelector<HTMLElement>("[data-hud-notice]");
  if (!el) return;
  if (reducedMotion()) { el.textContent = text; return; }
  el.setAttribute("data-swap", "");
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { el.textContent = text; el.removeAttribute("data-swap"); }, 220);
}

export function view(workId: string): number {
  store = read();
  store.viewed[workId] = (store.viewed[workId] ?? 0) + 1;
  write(store);
  return store.viewed[workId];
}
export function viewedCount(workId: string): number { return read().viewed[workId] ?? 0; }

export function bindViewed() {
  document.querySelectorAll<HTMLElement>("[data-viewed]").forEach((el) => {
    const n = viewedCount(el.dataset.viewed!);
    el.textContent = `Viewed ${pad(n)} ${n === 1 ? "time" : "times"}`;
  });
}

export function bindShell() {
  refreshId();
  bindViewed();
  cart();
  document.querySelectorAll<HTMLElement>("[data-motion-toggle]").forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", toggleMotion);
  });
  applyMotionPreference();
}

countVisit();
document.addEventListener("astro:page-load", () => { store = read(); bindShell(); });
if (document.readyState !== "loading") bindShell();
