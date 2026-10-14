import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { notice, reducedMotion, cookieSheet, consented, score } from "./system";
import { watchReader } from "./behaviour";
import { play } from "./sound";

gsap.registerPlugin(ScrollTrigger);

const timers: number[] = [];
let off: Array<() => void> = [];

export function teardownHome() {
  timers.splice(0).forEach((t) => window.clearTimeout(t));
  off.splice(0).forEach((f) => f());
  ScrollTrigger.getAll().forEach((s) => s.kill());
}

export function initHome() {
  const root = document.documentElement;
  if (root.dataset.page !== "home") return;
  teardownHome();
  const rm = reducedMotion();

  // First twenty seconds. 0.0 s the device sets itself up. 0.4 s the masthead prints.
  // 2.6 s the cookie sheet asks. 4.5 s the rank. The still develops when the reader
  // answers or moves (fallback at 7 s). The sticker lands after, then the navigation.
  const cover = document.querySelector<HTMLElement>("[data-cover]");
  const boot = document.querySelector<HTMLElement>("[data-boot]");
  const showNav = () => { root.dataset.nav = "on"; };
  const showHud = () => { root.dataset.hud = "on"; };
  if (rm || !cover) { showNav(); showHud(); cookieSheet(0); } else {
    delete root.dataset.nav; delete root.dataset.hud;
    cover.setAttribute("data-staged", "");
    const seen = consented(); // a returning reader is not set up twice
    if (boot && !seen) {
      root.dataset.boot = "on";
      const line = boot.querySelector<HTMLElement>("[data-boot-line]");
      const bar = boot.querySelector<HTMLElement>("[data-boot-bar]");
      const steps: Array<[number, string, number]> = [[0, "Setting up your experience of being measured", 12], [700, "Checking attention", 38], [1300, "Personalizing taste", 71], [1900, "Done.", 100]];
      steps.forEach(([at, text, pct]) => timers.push(window.setTimeout(() => { if (line) line.textContent = text; if (bar) bar.style.width = pct + "%"; }, at)));
      timers.push(window.setTimeout(() => boot.setAttribute("data-done", ""), 2400));
      timers.push(window.setTimeout(() => { delete root.dataset.boot; }, 3000));
    }
    let developed = false;
    const develop = () => { if (developed) return; developed = true; cover.setAttribute("data-image", ""); timers.push(window.setTimeout(() => cover.setAttribute("data-sticker", ""), 1500)); timers.push(window.setTimeout(showNav, 500)); };
    const once = () => { timers.push(window.setTimeout(develop, 300)); stop(); };
    const stop = () => { ["pointermove", "keydown", "touchstart"].forEach((e) => window.removeEventListener(e, once)); document.removeEventListener("slop:consent", once); };
    ["pointermove", "keydown", "touchstart"].forEach((e) => window.addEventListener(e, once, { passive: true, once: true }));
    document.addEventListener("slop:consent", once, { once: true });
    off.push(stop);
    timers.push(window.setTimeout(() => cover.setAttribute("data-mast", ""), 400));
    cookieSheet(seen ? 0 : 2600);
    timers.push(window.setTimeout(showHud, 4500));
    timers.push(window.setTimeout(develop, seen ? 2000 : 7000));
    timers.push(window.setTimeout(showNav, 11000));
    timers.push(window.setTimeout(() => { if (scrollY < 40) notice("Awaiting input. Taste update available.", { once: "await" }); }, 16000));
  }

  const rise = document.querySelector<HTMLElement>("[data-rise]");
  const img = document.querySelector<HTMLElement>("[data-rise-img]");
  const statement = document.querySelector<HTMLElement>("[data-statement]");
  if (rise && img && statement && !rm) {
    rise.setAttribute("data-staged", "");
    const metrics = Array.from(statement.querySelectorAll<HTMLElement>("[data-metric]"));
    const at = [0.56, 0.66, 0.76];
    const counter = statement.querySelector<HTMLElement>("[data-count]");
    let counted = false;
    const mark = (p: number) => metrics.forEach((el, i) => {
      const on = p >= at[i];
      el.toggleAttribute("data-on", on);
      if (i === 0 && on && !counted && counter) { counted = true; gsap.fromTo(counter, { textContent: 0 }, { textContent: Number(counter.dataset.count), duration: 1.2, snap: { textContent: 1 }, ease: "power2.out" }); score(40); }
    });

    gsap.set(statement, { y: 30 });
    ScrollTrigger.create({
      trigger: rise,
      start: "top 85%",
      end: "bottom bottom",
      onUpdate: (self) => {
        const p = self.progress;
        const a = gsap.utils.clamp(0, 1, p / 0.32);
        const e = 1 - Math.pow(1 - a, 3);
        img.style.clipPath = `inset(${(1 - e) * 100}% 0 0 0)`;
        const b = gsap.utils.clamp(0, 1, (p - 0.3) / 0.16);
        statement.style.opacity = String(b);
        statement.style.transform = `translateY(${(1 - b) * 30}px)`;
        mark(p);
        if (p > 0.42) notice("This image performed well.", { once: "beauty" });
      },
    });
  }

  off.push(watchReader({ dwellTarget: "[data-stage]" }) as () => void);

  // Make the shared element instant: fetch the exact image candidate the feed page will pick.
  const warmEl = document.querySelector<HTMLElement>("[data-warm]");
  const warm = () => {
    if (!warmEl) return;
    const im = new Image();
    im.sizes = "100vw";
    im.srcset = warmEl.dataset.srcset ?? "";
    im.src = warmEl.dataset.src ?? "";
    void im.decode?.().catch(() => {});
  };
  const idx = document.querySelector(".index");
  if (idx && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { warm(); io.disconnect(); } }, { rootMargin: "800px 0px" });
    io.observe(idx); off.push(() => io.disconnect());
  } else warm();

  const link = document.querySelector<HTMLAnchorElement>("[data-hero-link]");
  link?.addEventListener("click", () => { play("shutter"); notice("Approved."); });
}

document.addEventListener("astro:before-swap", teardownHome);
