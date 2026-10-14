// Local session state: the reader's motion preference. Nothing here leaves the device.
const KEY = "slop.session";

type Store = { motion?: "reduce" | "auto" };

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch { /* storage may be blocked: the site renders without it */ }
  return {};
}
function write(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Effective reduced motion: the OS preference or the reader's explicit choice. */
export function reducedMotion(): boolean {
  return document.documentElement.hasAttribute("data-rm");
}

function paintToggle() {
  document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]").forEach((b) => {
    const on = reducedMotion();
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "Motion: reduced" : "Motion: full";
  });
}

/** `fromQuery` is true only on first load: a ?motion= switch must not override a later toggle click. */
export function applyMotionPreference(fromQuery = false) {
  const root = document.documentElement;
  const store = read();
  const q = new URLSearchParams(location.search).get("motion");
  if (fromQuery && (q === "reduce" || q === "auto")) { store.motion = q; write(store); }
  const os = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (os || store.motion === "reduce") root.setAttribute("data-rm", ""); else root.removeAttribute("data-rm");
  paintToggle();
  document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]").forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", () => {
      const s = read();
      s.motion = reducedMotion() ? "auto" : "reduce";
      write(s);
      applyMotionPreference();
    });
  });
}
