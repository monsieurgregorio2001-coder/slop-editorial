import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { notice, view, bindViewed, reducedMotion, cart, score } from "./system";
import { watchReader } from "./behaviour";
import { pickTier, type Tier } from "./tier";
import type { SealHandle } from "./seal-scene";
import { play } from "./sound";
import { money } from "../lib/text.js";

gsap.registerPlugin(ScrollTrigger);
const FRAMES = 18;
const B = import.meta.env.BASE_URL;
let off: Array<() => void> = [];
let handle: SealHandle | null = null;

function teardown() {
  document.documentElement.removeAttribute("data-commerce");
  off.splice(0).forEach((f) => f());
  ScrollTrigger.getAll().forEach((s) => s.kill());
  handle?.dispose(); handle = null;
}

export async function initAuthenticity() {
  const root = document.documentElement;
  if (root.dataset.page !== "authenticity") return;
  teardown();
  const rm = reducedMotion();
  const host = document.querySelector<HTMLElement>("[data-seal]");
  const stage = document.querySelector<HTMLElement>("[data-stage]");
  const runway = document.querySelector<HTMLElement>("[data-runway]");
  const tierEl = document.querySelector<HTMLElement>("[data-tier]");
  const ctl = document.querySelector<HTMLElement>("[data-ctl]");
  const poster = document.querySelector<HTMLElement>("[data-poster]");
  const posterImg = document.querySelector<HTMLImageElement>("[data-poster-img]");
  if (!host || !stage || !runway) return;

  view("the-certificate");
  bindViewed();
  notice("Welcome. Queue time: 4 min.", { once: "welcome" });
  play("seal");

  // The cart works. A number in this browser, and the receipt itemizes it.
  const shop = (names: string[]) => document.querySelectorAll<HTMLElement>("[data-shop]").forEach((el) => el.toggleAttribute("data-on", names.includes(el.dataset.shop!)));
  const receipt = () => {
    const n = cart();
    const t = document.querySelector<HTMLElement>("[data-cart-total]"); if (t) t.textContent = money(n * 14.99);
    const tot = document.querySelector<HTMLElement>("[data-total]"); if (tot) tot.textContent = money(n * 14.99 + 2);
  };
  receipt();
  const add = () => { cart(1); receipt(); score(30); notice(`Added. ${cart()} in the cart. Free shipping on redemption.`); play("confirm"); };
  const addBtn = document.querySelector<HTMLButtonElement>("[data-add-cart]");
  addBtn?.addEventListener("click", add);
  off.push(() => addBtn?.removeEventListener("click", add));
  if (rm) shop(["barrier", "notice", "sani", "pay", "finger", "pack"]);

  const { tier, why } = pickTier();
  const beats = Array.from(document.querySelectorAll<HTMLElement>("[data-beat]"));
  const buybar = document.querySelector<HTMLElement>("[data-buybar]");

  let light = rm ? 1 : 0, frameIdx = 0;
  const setFrame = (f: number) => {
    if (!posterImg) return;
    const i = ((Math.round(f) % FRAMES) + FRAMES) % FRAMES;
    if (i !== frameIdx || !posterImg.getAttribute("src")) { frameIdx = i; posterImg.src = `${B}img/seal/seal-${String(i).padStart(2, "0")}.webp`; }
  };
  const applyLight = (l: number) => { light = l; handle?.setLight(l); host.style.setProperty("--lit", String(0.35 + l * 0.8)); };

  // --- Mount the object for the chosen tier ---
  let used: Tier = tier;
  if (tier !== "poster") {
    try {
      const { mountSeal } = await import("./seal-scene");
      handle = await mountSeal(host, { tier, dpr: Math.min(devicePixelRatio, 2) });
      used = handle.renderer;
    } catch (e) {
      console.warn("seal: 3D unavailable, using poster sequence", e);
      used = "poster";
    }
  }
  if (document.documentElement.dataset.page !== "authenticity") { handle?.dispose(); handle = null; return; }
  root.removeAttribute("data-commerce");
  if (poster) poster.hidden = used !== "poster";
  if (used === "poster") {
    // The first frame ships in the HTML. The rest are fetched once the page has settled.
    const rest = () => { for (let i = 1; i < FRAMES; i++) new Image().src = `${B}img/seal/seal-${String(i).padStart(2, "0")}.webp`; };
    if (document.readyState === "complete") window.setTimeout(rest, 600); else window.addEventListener("load", () => window.setTimeout(rest, 600), { once: true });
  }
  host.dataset.tier = used;
  if (tierEl) tierEl.textContent = `Render: ${used} (${used === tier ? why : "fallback"})`;
  if (ctl) ctl.hidden = false;
  applyLight(light);
  if (handle && rm) handle.setAuto(false);

  // --- Drag to rotate. Buttons and arrow keys for everyone. No wheel capture. ---
  let dragging = false, lx = 0, ly = 0, posterAngle = 0;
  const rotate = (dy: number, dx = 0) => {
    if (handle) handle.rotate(dy, dx);
    else { posterAngle += dy; setFrame((posterAngle / (Math.PI * 2)) * FRAMES); }
  };
  const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; handle?.setAuto(false); host.setPointerCapture?.(e.pointerId); };
  const mv = (e: PointerEvent) => {
    if (dragging) { rotate((e.clientX - lx) * 0.01, (e.clientY - ly) * 0.004); lx = e.clientX; ly = e.clientY; return; }
    if (e.pointerType === "mouse") { const r = host.getBoundingClientRect(); handle?.setLean(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1); }
  };
  const up = () => { dragging = false; };
  host.addEventListener("pointerdown", down); host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up);
  host.tabIndex = 0;
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { rotate(-0.2); e.preventDefault(); }
    if (e.key === "ArrowRight") { rotate(0.2); e.preventDefault(); }
    if (e.key === "+" || e.key === "=") handle?.zoom(-1);
    if (e.key === "-") handle?.zoom(1);
  };
  host.addEventListener("keydown", key);
  const bt = (e: Event) => {
    const t = e.target as HTMLElement;
    const r = t.closest<HTMLElement>("[data-rot]"), z = t.closest<HTMLElement>("[data-zoom]");
    if (r) rotate(Number(r.dataset.rot) * 0.35);
    if (z) handle?.zoom(Number(z.dataset.zoom) * 1.5);
  };
  ctl?.addEventListener("click", bt);
  const rs = () => handle?.resize();
  window.addEventListener("resize", rs);
  off.push(() => { host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); host.removeEventListener("keydown", key); ctl?.removeEventListener("click", bt); window.removeEventListener("resize", rs); });

  // --- The sequence: look at this first, then this, then why it matters. ---
  if (!rm) {
    const n = beats.length;
    let active = -1;
    const show = (i: number) => {
      if (i === active) return;
      active = i;
      beats.forEach((b, k) => { if (k === i) b.setAttribute("data-on", ""); else b.removeAttribute("data-on"); });
      // The shop arrives one object at a time, after the two clean beats.
      shop(i >= 2 ? ["barrier", ...(i >= 3 ? ["notice", "sani"] : []), ...(i >= 4 ? ["pay"] : []), ...(i >= 5 ? ["finger", "pack"] : [])] : []);
      if (i === 2) notice("Please queue behind the barrier.", { once: "queue" });
      if (i === 3) notice("Please sanitize before appreciating.", { once: "seal" });
      if (i === 4) { notice("Appreciation open. Contactless accepted.", { once: "don" }); play("chime"); }
      buybar?.toggleAttribute("data-on", i >= 4);
      root.toggleAttribute("data-commerce", i >= 4);
    };
    show(0);
    ScrollTrigger.create({
      trigger: document.querySelector("[data-launch]")!, start: "top top", end: "bottom bottom",
      onUpdate: (self) => {
        const p = self.progress;
        show(Math.min(n - 1, Math.floor(p * n)));
        applyLight(gsap.utils.clamp(0, 1, p / 0.3));
        if (!handle) { posterAngle = p * Math.PI * 2 * 1.4; setFrame((posterAngle / (Math.PI * 2)) * FRAMES); }
      },
    });
  } else {
    beats.forEach((b) => b.setAttribute("data-on", ""));
  }

  off.push(watchReader() as () => void);
  document.querySelector<HTMLElement>("[data-back]")?.addEventListener("click", () => play("card"));
}

document.addEventListener("astro:before-swap", teardown);
