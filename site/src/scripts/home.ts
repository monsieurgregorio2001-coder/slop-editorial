import { notice, cookieSheet, consented } from "./system";
import { watchReader } from "./behaviour";
import { play } from "./sound";

let off: Array<() => void> = [];

export function teardownHome() {
  off.splice(0).forEach((f) => f());
}

export function initHome() {
  const root = document.documentElement;
  if (root.dataset.page !== "home") return;
  teardownHome();

  // The front of the gallery is quiet. The one joke every visitor gets arrives after 2.6 s,
  // or at once for a returning reader and under reduced motion.
  cookieSheet(consented() ? 0 : 2600);

  // The system notices the reader standing in front of the still.
  off.push(watchReader({ dwellTarget: "[data-stage]" }) as () => void);

  // Make the shared element instant: decode the exact image the feed page will pick.
  const warmEl = document.querySelector<HTMLElement>("[data-warm]");
  const warm = () => {
    if (!warmEl) return;
    const im = new Image();
    im.sizes = "100vw";
    im.srcset = warmEl.dataset.srcset ?? "";
    im.src = warmEl.dataset.src ?? "";
    void im.decode?.().catch(() => {});
  };
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1200));
  idle(warm);

  const link = document.querySelector<HTMLAnchorElement>("[data-hero-link]");
  link?.addEventListener("click", () => { play("shutter"); notice("Approved."); });
}

document.addEventListener("astro:before-swap", teardownHome);
