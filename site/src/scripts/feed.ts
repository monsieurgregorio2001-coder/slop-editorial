import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { animate } from "motion";
import { notice, view, bindViewed, reducedMotion, dialog, score, cart } from "./system";
import { watchReader } from "./behaviour";
import { play } from "./sound";

gsap.registerPlugin(ScrollTrigger);
let off: Array<() => void> = [];

function teardown() {
  off.splice(0).forEach((f) => f());
  ScrollTrigger.getAll().forEach((s) => s.kill());
}

export function initFeed() {
  const root = document.documentElement;
  if (root.dataset.page !== "feed") return;
  teardown();
  const rm = reducedMotion();
  const stage = document.querySelector<HTMLElement>("[data-stage]");
  const img = document.querySelector<HTMLElement>("[data-hero-img]");
  if (!stage || !img) return;

  const views = view("the-still");
  bindViewed();
  notice("Approved.");
  play("shutter");
  const v = document.querySelector<HTMLElement>("[data-views]");
  if (v) v.textContent = String(184 + views);

  // --- Embarrassment: the reader who stops on the image is timed, out loud. ---
  let still = 0, stillT: number | undefined;
  const reset = () => { still = performance.now(); window.clearTimeout(stillT); stillT = window.setTimeout(() => { const s = String(Math.round((performance.now() - still) / 1000)).padStart(2, "0"); if (scrollY < innerHeight * 0.5) notice(`You have been looking for 0:${s}. That is above average.`, { once: "looking" }); }, 7000); };
  reset();
  window.addEventListener("pointermove", reset, { passive: true });
  off.push(() => { window.removeEventListener("pointermove", reset); window.clearTimeout(stillT); });

  // --- Hold to appreciate (touch). A ring fills, appreciation is registered, shipping is free. ---
  const ring = document.querySelector<HTMLElement>("[data-ring]");
  const hint = document.querySelector<HTMLElement>("[data-hold-hint]");
  let holdRaf = 0, holdStart = 0;
  const holdEnd = () => { cancelAnimationFrame(holdRaf); ring?.removeAttribute("data-on"); ring?.style.setProperty("--p", "0"); };
  const holdTick = () => { const p = Math.min(1, (performance.now() - holdStart) / 900); ring?.style.setProperty("--p", String(p)); if (p < 1) holdRaf = requestAnimationFrame(holdTick); else { holdEnd(); score(60); cart(1); notice("Appreciation registered. Free shipping on redemption."); play("confirm"); if (hint) hint.textContent = "Appreciation registered"; } };
  const holdStartFn = (e: PointerEvent) => { if (e.pointerType === "mouse") return; holdStart = performance.now(); ring?.setAttribute("data-on", ""); holdRaf = requestAnimationFrame(holdTick); };
  stage.addEventListener("pointerdown", holdStartFn); stage.addEventListener("pointerup", holdEnd); stage.addEventListener("pointercancel", holdEnd);
  off.push(() => { stage.removeEventListener("pointerdown", holdStartFn); stage.removeEventListener("pointerup", holdEnd); stage.removeEventListener("pointercancel", holdEnd); holdEnd(); });

  // --- The dialog addresses the reader's own taste. Once per session. ---
  const askUpdate = async () => {
    try { if (sessionStorage.getItem("slop.update") === "1") return; sessionStorage.setItem("slop.update", "1"); } catch { /* ignore */ }
    const r = await dialog({ title: "Taste update available", body: "Your taste has 1 update available. Install now to delve into the rich tapestry of what you already like.", buttons: [{ id: "later", label: "Not now" }, { id: "install", label: "Install", primary: true }] });
    if (r === "install") { dialog({ title: "Installing", body: "Do not look away.", buttons: [], bar: true }); requestAnimationFrame(() => document.querySelector<HTMLElement>(".dialog__bar i")?.style.setProperty("width", "100%")); window.setTimeout(() => { document.querySelector(".dialog")?.remove(); notice("Installed. No visible difference."); score(30); }, 1500); }
    else if (r === "later") notice("Reminder set for tomorrow.");
  };
  const upT = window.setTimeout(askUpdate, rm ? 1500 : 9000);
  off.push(() => window.clearTimeout(upT));
  (window as unknown as { __askUpdate: () => void }).__askUpdate = askUpdate;

  // The crop follows the reader. The still leans toward the pointer (a spring on translate).
  let gx = 0, gy = 0, cur: { stop: () => void } | null = null;
  let closer = 0; // 0..1, driven by scroll: the image keeps getting closer
  const paint = () => {
    const s = 1 + closer * 0.08;
    img.style.transform = `translate3d(${gx * -1}%, ${gy * -1}%, 0) scale(${s})`;
  };
  paint();
  if (!rm) {
    const lean = (nx: number, ny: number) => {
      cur?.stop();
      const fx = gx, fy = gy;
      cur = animate(0, 1, {
        type: "spring", stiffness: 70, damping: 18, mass: 1,
        onUpdate: (t) => { gx = fx + (nx - fx) * t; gy = fy + (ny - fy) * t; paint(); },
      });
    };
    const move = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      lean((e.clientX / innerWidth) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    stage.addEventListener("pointermove", move, { passive: true });
    stage.addEventListener("pointerdown", move, { passive: true });
    off.push(() => { stage.removeEventListener("pointermove", move); stage.removeEventListener("pointerdown", move); cur?.stop(); });
    ScrollTrigger.create({ trigger: stage, start: "top top", end: "bottom top", onUpdate: (self) => { closer = self.progress; paint(); } });
  }

  // The metric counts up when the spec comes into view.
  const mc = document.querySelector<HTMLElement>("[data-m-count]");
  if (mc) {
    if (rm) mc.textContent = mc.dataset.mCount ?? "18";
    else ScrollTrigger.create({ trigger: mc, start: "top 80%", once: true, onEnter: () => { gsap.fromTo(mc, { textContent: 0 }, { textContent: Number(mc.dataset.mCount), duration: 1.2, snap: { textContent: 1 }, ease: "power2.out" }); score(20); notice("This image performed well.", { once: "beauty" }); } });
  }

  // Typography that behaves like software: the caption is read first without its one
  // decisive word, and the system inserts it once the reader is there.
  const cost = document.querySelector<HTMLElement>("[data-cost-text]");
  const ins = cost?.querySelector<HTMLElement>("[data-ins]");
  if (cost && ins) {
    const done = (() => { try { return sessionStorage.getItem("slop.edited") === "1"; } catch { return false; } })();
    if (done || rm) {
      ins.removeAttribute("data-off");
    } else {
      ins.setAttribute("data-off", "");
      ScrollTrigger.create({
        trigger: cost, start: "top 55%", once: true,
        onEnter: () => {
          window.setTimeout(() => {
            ins.removeAttribute("data-off"); ins.setAttribute("data-on", "");
            notice("Description updated.", { once: "edit" });
            try { sessionStorage.setItem("slop.edited", "1"); } catch { /* ignore */ }
          }, 1600);
        },
      });
    }
  }

  document.querySelector<HTMLElement>("[data-next]")?.addEventListener("click", () => play("card"));
  off.push(watchReader() as () => void);
}

document.addEventListener("astro:before-swap", teardown);
