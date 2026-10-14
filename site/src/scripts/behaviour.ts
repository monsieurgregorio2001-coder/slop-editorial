// "The system notices the reader." Real, local signals only: scroll depth, hesitation
// (direction reversal), dwell, and return from another tab. The signals drive HUD copy.
// Nothing is recorded or transmitted.
import { notice } from "./system";

type Opts = { dwellTarget?: string };
let cleanup: (() => void) | null = null;

export function watchReader(opts: Opts = {}) {
  cleanup?.();
  const off: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(t: Window, e: K, f: (ev: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
    t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o));
  };

  let lastY = window.scrollY, peak = lastY, lastMove = performance.now(), hiddenAt = 0;
  const dwellEl = opts.dwellTarget ? document.querySelector<HTMLElement>(opts.dwellTarget) : null;
  let dwellStart = 0, dwellShown = false;

  const tick = window.setInterval(() => {
    const idle = performance.now() - lastMove;
    if (dwellEl && !dwellShown) {
      const r = dwellEl.getBoundingClientRect();
      const inView = r.top < innerHeight * 0.55 && r.bottom > innerHeight * 0.45;
      if (inView && idle > 2400) {
        dwellStart = dwellStart || lastMove;
        dwellShown = true;
        const secs = ((performance.now() - dwellStart) / 1000).toFixed(1);
        const out = dwellEl.querySelector<HTMLElement>("[data-dwell]");
        if (out) { out.textContent = `You have been looking for ${secs} s. That is above average.`; out.dataset.on = ""; }
        notice("Still looking. Interest logged.", { once: "dwell" });
      } else if (!inView) { dwellStart = 0; }
    }
    if (idle > 9000) notice("Still there? Your place was held.", { once: "idle" });
  }, 400);
  off.push(() => window.clearInterval(tick));

  on(window, "scroll", () => {
    lastMove = performance.now();
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    if (y / max > 0.08) notice("Reading experience optimized.", { once: "ordinary" });
    if (y / max > 0.5) notice("Your taste has been updated.", { once: "taste" });
    if (y > peak) peak = y;
    if (peak - y > 320 && y < lastY) notice("Regenerate response.", { once: "hesitated" });
    lastY = y;
  }, { passive: true });
  on(window, "pointermove", () => { lastMove = performance.now(); }, { passive: true });
  on(window, "keydown", () => { lastMove = performance.now(); });

  const vis = () => {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    if (hiddenAt) {
      const s = Math.round((performance.now() - hiddenAt) / 1000);
      if (s >= 2) notice(`Welcome back. Your place was held for ${s} s.`, { once: `return${s > 20 ? "L" : "S"}` });
      hiddenAt = 0;
    }
  };
  document.addEventListener("visibilitychange", vis);
  off.push(() => document.removeEventListener("visibilitychange", vis));

  cleanup = () => { off.forEach((f) => f()); cleanup = null; };
  return cleanup;
}
