// Fetch-ahead on intent: start the work before the click. A hover (after 100 ms), a focus or a
// touch begins fetching the next page. The HTML is held in memory and handed to the router at
// navigation time, so the click costs no request. Requests go through a small queue with
// priorities and hard limits so neither the server nor the reader's connection is flooded.
// The service worker (public/sw.js) is the layer beneath this one, for repeat visits.

const HOVER_MS = 100;
const MAX_CONCURRENT = 2;
const MAX_TOTAL = 24;
const TTL_MS = 5 * 60_000; // a held page is used for five minutes, then refetched

type Job = { url: string; prio: number };
type Held = { html: Promise<string>; at: number };
const held = new Map<string, Held>();
const queue: Job[] = [];
let active = 0;
let total = 0;
export const stats = { started: 0, completed: 0, maxActive: 0, skipped: 0, served: 0 };

function allowed(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(c?.saveData || /(^|-)2g$/.test(c?.effectiveType ?? ""));
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    queue.sort((a, b) => b.prio - a.prio);
    const job = queue.shift()!;
    active++; stats.started++; stats.maxActive = Math.max(stats.maxActive, active);
    const html = fetch(job.url, { credentials: "same-origin", headers: { Accept: "text/html" } })
      .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("text/html") ? r.text() : ""))
      .catch(() => "");
    held.set(job.url, { html, at: performance.now() });
    html.then((h) => { if (!h) held.delete(job.url); })
      .finally(() => { active--; stats.completed++; pump(); });
  }
}

export function fetchAhead(href: string, prio: number) {
  if (!allowed()) { stats.skipped++; return; }
  const u = new URL(href, location.href);
  if (u.origin !== location.origin || u.pathname === location.pathname || /\.[a-z0-9]{2,5}$/i.test(u.pathname)) return;
  const key = u.pathname + u.search;
  const have = held.get(key);
  if (have && performance.now() - have.at < TTL_MS) return;
  if (total >= MAX_TOTAL) return;
  total++;
  queue.push({ url: key, prio });
  pump();
}

// The in-memory layer: when the router prepares a page this module already holds, the held HTML
// becomes the new document and no request is made.
document.addEventListener("astro:before-preparation", (e) => {
  const ev = e as Event & { to: URL; newDocument: Document; loader: () => Promise<void> };
  const prev = ev.loader;
  ev.loader = async () => {
    const have = held.get(ev.to.pathname + ev.to.search);
    const html = have && performance.now() - have.at < TTL_MS ? await have.html : "";
    if (html) { ev.newDocument = new DOMParser().parseFromString(html, "text/html"); stats.served++; } else await prev();
  };
});

let timer: number | undefined;
let pending: HTMLAnchorElement | null = null;
const linkOf = (t: EventTarget | null) => (t as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;

function onOver(e: Event) {
  const a = linkOf(e.target);
  if (!a || a === pending || a.hasAttribute("data-no-prefetch")) return;
  pending = a;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { fetchAhead(a.href, 2); }, HOVER_MS);
}
function onOut(e: Event) {
  const a = linkOf(e.target);
  if (!a || a !== pending || a.contains((e as PointerEvent).relatedTarget as Node | null)) return;
  window.clearTimeout(timer); pending = null;
}
function onTouch(e: Event) {
  const a = linkOf(e.target);
  if (a) fetchAhead(a.href, 3); // a touch is a commitment: no delay, top priority
}

let bound = false;
export function initIntent() {
  if (!bound) {
    bound = true;
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    document.addEventListener("focusin", (e) => { const a = linkOf(e.target); if (a) fetchAhead(a.href, 2); });
    document.addEventListener("touchstart", onTouch, { passive: true });
    document.addEventListener("mousedown", onTouch, { passive: true });
  }
  // Likely next pages, fetched when the browser is idle, lowest priority.
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500));
  idle(() => {
    document.querySelectorAll<HTMLAnchorElement>(".shell a[href], a.row[href]").forEach((a) => fetchAhead(a.href, 1));
  });
}

// Exposed for the verification script only: counters, no behaviour.
(window as unknown as { __intent: unknown }).__intent = { stats, fetchAhead };
