import { notice, view, bindViewed, reducedMotion, cart, score } from "./system";
import { watchReader } from "./behaviour";
import { play } from "./sound";
import { money } from "../lib/text.js";

let off: Array<() => void> = [];

function teardown() {
  document.documentElement.removeAttribute("data-commerce");
  off.splice(0).forEach((f) => f());
}

export async function initAuthenticity() {
  const root = document.documentElement;
  if (root.dataset.page !== "authenticity") return;
  teardown();
  const rm = reducedMotion();
  const host = document.querySelector<HTMLElement>("[data-seal]");
  const stage = document.querySelector<HTMLElement>("[data-stage]");
  const runway = document.querySelector<HTMLElement>("[data-runway]");
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

  const beats = Array.from(document.querySelectorAll<HTMLElement>("[data-beat]"));
  const buybar = document.querySelector<HTMLElement>("[data-buybar]");

  // The certificate is a photograph. Scroll brings the light up and carries a band of it across the plate.
  const applyLight = (l: number, sweep: number) => { host.style.setProperty("--lit", String(0.6 + l * 0.45)); host.style.setProperty("--sweep", String(sweep)); };
  applyLight(rm ? 1 : 0, 0.5);

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
    // Plain scroll progress through the runway. A passive listener, no wheel capture, no pinning library.
    const launch = document.querySelector<HTMLElement>("[data-launch]")!;
    let queued = false;
    const update = () => {
      queued = false;
      const r = launch.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      show(Math.min(n - 1, Math.floor(p * n)));
      applyLight(Math.min(1, p / 0.3), p);
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    off.push(() => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); });
    update();
  } else {
    beats.forEach((b) => b.setAttribute("data-on", ""));
  }

  off.push(watchReader() as () => void);
  document.querySelector<HTMLElement>("[data-back]")?.addEventListener("click", () => play("card"));
}

document.addEventListener("astro:before-swap", teardown);
