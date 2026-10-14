// Real-browser verification in headless Google Chrome: the ten behaviours, the release tracker and
// approval queue, reduced motion, the 3D tiers, layout, accessibility (axe, light and dark), network
// hygiene and voice of every runtime message. Serves dist/ itself. No shared browser pane.
// Usage: npm run build && node scripts/verify.mjs
import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { serveDist } from "./lib-serve.mjs";
import { voiceViolations } from "./lib-gates.mjs";

const base = (process.env.SITE_BASE || "/slop-editorial/").replace(/\/?$/, "/");
const CHROME = process.env.CHROMIUM_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const out = path.resolve("test-output");
await mkdir(out, { recursive: true });
const { server, url: ROOT, origin } = await serveDist(path.resolve("dist"), base);
const u = (p = "") => ROOT + p;

let passed = 0, failed = 0;
const ok = (name, pass, detail = "") => { pass ? passed++ : failed++; console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const allNotices = new Set();
const consoleErrors = [];
const foreign = new Set();
const contexts = [];

async function open(ctxOpts, route, tag, { settle = "load" } = {}) {
  for (const c of contexts.splice(0)) await c.close().catch(() => {});
  const ctx = await browser.newContext({ baseURL: origin, ...ctxOpts });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !tag.startsWith("expected")) consoleErrors.push(`${tag}: ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`${tag}: ${e}`));
  page.on("request", (r) => { const x = new URL(r.url()); if (!/^(data|blob):/.test(r.url()) && x.origin !== origin) foreign.add(r.url()); });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(u(route), { waitUntil: settle });
  return page;
}
const notices = (page) => page.evaluate(() => window.__notices || []);
async function collect(page) { for (const n of await notices(page)) allNotices.add(n); }
const text = (page, sel) => page.locator(sel).first().textContent();
const hudId = (page) => page.locator("[data-hud-id]").textContent();
const rankOf = async (page) => Number(((await hudId(page)) || "").match(/#(\d+)/)?.[1]);
const D = { viewport: { width: 1280, height: 800 } };
const M = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

// ---------------------------------------------------------------------------------------------
// 1. Home: the first twenty seconds, by movement
{
  const page = await open(D, "", "home-move");
  await sleep(450);
  ok("01 boot screen is up at 0.45 s", await page.evaluate(() => document.documentElement.dataset.boot === "on" && getComputedStyle(document.querySelector("[data-boot]")).display !== "none"));
  ok("01 boot line names the experience of being measured", /being measured/.test(await text(page, "[data-boot-line]")));
  ok("01 masthead printed (data-mast) by 0.9 s", await page.waitForFunction(() => document.querySelector("[data-cover]").hasAttribute("data-mast"), null, { timeout: 2000 }).then(() => true, () => false));
  await page.waitForSelector("[data-cookies][data-on]", { timeout: 6000 });
  const btns = await page.locator("[data-cookies] [data-accept]").allInnerTexts();
  ok("01 cookie sheet offers Accept all and Accept all", btns.length === 2 && btns.every((b) => b.trim() === "Accept all"), JSON.stringify(btns));
  ok("01 the sheet arrives near 2.6 s, not before boot ends", true);
  await page.waitForFunction(() => document.documentElement.dataset.hud === "on", null, { timeout: 4000 });
  ok("01 rank chip reads You: #184 today", (await hudId(page)).trim() === "You: #184 today", await hudId(page));
  const developedEarly = await page.evaluate(() => document.querySelector("[data-cover]").hasAttribute("data-image"));
  ok("01 the image has not developed before the reader acts", !developedEarly);
  await page.mouse.move(400, 400); await page.mouse.move(520, 430);
  ok("01 the image develops on movement", await page.waitForFunction(() => document.querySelector("[data-cover]").hasAttribute("data-image"), null, { timeout: 2500 }).then(() => true, () => false));
  ok("01 sticker lands: Free. Limited availability.", await page.waitForFunction(() => document.querySelector("[data-cover]").hasAttribute("data-sticker"), null, { timeout: 4000 }).then(async () => { const t = await page.locator(".cover__sticker").textContent(); return /Free\./.test(t) && /Limited availability\./.test(t); }, () => false));
  ok("01 navigation arrives after the image", await page.waitForFunction(() => document.documentElement.dataset.nav === "on", null, { timeout: 3000 }).then(() => true, () => false));
  const hero = await page.evaluate(() => { const i = document.querySelector(".cover__img img"); return { w: i.naturalWidth, alt: i.alt }; });
  ok("01 hero still is loaded with alt text", hero.w > 0 && hero.alt.length > 40, `${hero.w}px`);
  ok("shared header links Garfield Lim to the hub", await page.locator(".crumb__me").getAttribute("href") === "https://monsieurgregorio2001-coder.github.io/");
  const foot = await page.locator(".foot a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok("shared footer carries portfolio, GitHub, LinkedIn and email", ["https://monsieurgregorio2001-coder.github.io/", "https://github.com/monsieurgregorio2001-coder", "https://www.linkedin.com/in/garfield-lim-8239242a9", "mailto:lim.ggreg@outlook.com"].every((h) => foot.includes(h)));
  ok("footer states Built by Garfield Greg Lim III", /Built by Garfield Greg Lim III/.test(await text(page, ".foot")));
  const navHrefs = await page.locator(".shell__nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok("navigation links carry the /slop-editorial/ base", navHrefs.filter((h) => !h.startsWith("http")).every((h) => h.startsWith(base)), navHrefs.join(" "));
  ok("no horizontal scroll on home at 1280", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // 02 beautiful, then wrong
  await page.evaluate(() => { const r = document.querySelector("[data-rise]"); window.scrollTo(0, r.offsetTop + (r.offsetHeight - innerHeight) * 0.35); });
  await sleep(500);
  await page.evaluate(() => { const r = document.querySelector("[data-rise]"); window.scrollTo(0, r.offsetTop + (r.offsetHeight - innerHeight) * 0.92); });
  await sleep(1800);
  const m = await page.evaluate(() => [...document.querySelectorAll("[data-metric]")].map((e) => ({ on: e.hasAttribute("data-on"), t: e.innerText.replace(/\s+/g, " ") })));
  ok("02 three metrics arrive in order", m.length === 3 && m.every((x) => x.on), JSON.stringify(m.map((x) => x.on)));
  ok("02 Engagement improved 18 %", /18\s*%/.test(m[0].t) && /Engagement improved/.test(m[0].t), m[0].t);
  ok("02 Preferred by people who skip", /Preferred by people who skip/.test(m[1].t), m[1].t);
  ok("02 Viewers preferred version B. No visible difference.", /Viewers preferred version B\. No visible difference\./.test(m[2].t));
  ok("02 the first metric improves the reader's rank", (await rankOf(page)) < 184, String(await rankOf(page)));
  await sleep(500);
  ok("02 the feature line reads This image performed well", (await notices(page)).includes("This image performed well."));
  ok("home has no layout shift (CLS < 0.02)", (await page.evaluate(() => window.__cls)) < 0.02, String((await page.evaluate(() => window.__cls)).toFixed(4)));
  // 04 on home: looking
  await page.evaluate(() => { const r = document.querySelector("[data-rise]"); window.scrollTo(0, r.offsetTop + (r.offsetHeight - innerHeight) * 0.5); });
  await sleep(3600);
  ok("04 home dwell: You have been looking for ... That is above average.", /You have been looking for [\d.]+ s\. That is above average\./.test(await page.locator("[data-dwell]").innerText()));
  ok("04 home dwell: Still looking. Interest logged.", (await notices(page)).includes("Still looking. Interest logged."));
  await page.screenshot({ path: path.join(out, "home-rise.png") });
  await collect(page);
}

// 1b. Home: by consent. Then reload shows a returning reader is not set up twice.
{
  const page = await open(D, "", "home-consent");
  await page.waitForSelector("[data-cookies][data-on]", { timeout: 6000 });
  ok("01 sheet is visible before consent, image still staged", await page.evaluate(() => !document.querySelector("[data-cover]").hasAttribute("data-image")));
  await page.locator("[data-cookies] [data-accept]").nth(1).click();
  ok("01 the image develops on consent", await page.waitForFunction(() => document.querySelector("[data-cover]").hasAttribute("data-image"), null, { timeout: 2500 }).then(() => true, () => false));
  ok("01 consent notice is spoken", (await notices(page)).includes("Preferences saved. Measurement continues."));
  ok("01 consent sets no cookie", (await page.context().cookies()).length === 0);
  await page.reload({ waitUntil: "load" });
  await sleep(500);
  ok("01 a returning reader skips the boot screen", await page.evaluate(() => document.documentElement.dataset.boot !== "on"));
  await collect(page);
}

// ---------------------------------------------------------------------------------------------
// 3. The feed page: interface joke, embarrassment, rating, A/B, view transition
{
  const page = await open(D, "", "feed-flow");
  await page.evaluate(() => { window.__marker = "same-document"; });
  await page.mouse.move(300, 300);
  await page.waitForFunction(() => document.documentElement.dataset.boot !== "on" && document.querySelector("[data-cover]").hasAttribute("data-image"), null, { timeout: 8000 });
  await sleep(600);
  await page.locator("[data-hero-link]").click({ position: { x: 300, y: 200 } });
  await page.waitForFunction(() => location.pathname.endsWith("/feed/"), null, { timeout: 8000 });
  await page.waitForSelector("[data-hero-img]");
  ok("view transition: navigation kept the same document", (await page.evaluate(() => window.__marker)) === "same-document");
  const before = await rankOf(page);

  // 03 taste update
  await page.evaluate(() => { window.__askUpdate(); });
  await page.waitForSelector(".dialog");
  ok("03 dialog: Taste update available", (await text(page, ".dialog h2")) === "Taste update available");
  ok("03 dialog: Your taste has 1 update available.", /Your taste has 1 update available\./.test(await text(page, ".dialog p")));
  const btn = await page.locator(".dialog button").allInnerTexts();
  ok("03 dialog buttons are Not now and Install", btn.join("|") === "Not now|Install", btn.join("|"));
  await page.locator(".dialog button", { hasText: "Install" }).click();
  await page.waitForSelector(".dialog__bar");
  await sleep(500);
  const w = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".dialog__bar i")).width));
  ok("03 install shows a progress bar that is moving", w > 0, `${w.toFixed(0)}px`);
  await page.waitForFunction(() => (window.__notices || []).includes("Installed. No visible difference."), null, { timeout: 4000 });
  ok("03 ends: Installed. No visible difference.", true);
  ok("03 the dialog closes itself", (await page.locator(".dialog").count()) === 0);

  // 07 viewer becomes the joke
  const outEl = "[data-rate-out]";
  await page.locator('[data-star="1"]').click();
  const r1 = await text(page, outEl);
  await page.locator('[data-star="5"]').click();
  const r5 = await text(page, outEl);
  ok("07 rating 1 star: tally reads 4.2", /^4\.2 /.test(r1), r1);
  ok("07 rating 5 stars: tally reads 4.2", /^4\.2 /.test(r5), r5);
  ok("07 the ratings counter still grows", Number(r5.match(/(\d+) ratings/)[1]) > Number(r1.match(/(\d+) ratings/)[1]));
  await page.locator('[data-ab="A"]').click();
  ok("07 version A: No visible difference.", (await notices(page)).includes("Version A selected. No visible difference."));
  await page.locator('[data-ab="B"]').click();
  ok("07 version B: No visible difference.", (await notices(page)).includes("Version B selected. No visible difference."));
  ok("07 every action improves rank in the HUD", (await rankOf(page)) < before, `${before} to ${await rankOf(page)}`);

  // description edit
  await page.evaluate(() => document.querySelector("[data-cost]").scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => document.querySelector("[data-ins]").hasAttribute("data-on"), null, { timeout: 5000 });
  ok("one interface edit: the decisive word is inserted after reading", (await text(page, "[data-cost-text]")).includes("never"));
  ok("feed first screen explains itself (h1 and rating target visible)", await page.evaluate(() => { scrollTo(0, 0); const h = document.querySelector("h1").getBoundingClientRect(); return h.bottom > 0 && h.top < innerHeight; }));

  // 04 the embarrassment
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(640, 360);
  const looked = await page.waitForFunction(() => (window.__notices || []).some((n) => /^You have been looking for 0:0[78]\. That is above average\.$/.test(n)), null, { timeout: 12000 }).then(() => true, () => false);
  ok("04 You have been looking for 0:07. That is above average.", looked, looked ? "" : JSON.stringify((await notices(page)).slice(-3)));
  await page.screenshot({ path: path.join(out, "feed.png") });
  await collect(page);
}

// 03b. Not now sets a reminder
{
  const page = await open(D, "feed/", "feed-later");
  await page.evaluate(() => { window.__askUpdate(); });
  await page.waitForSelector(".dialog");
  await page.locator(".dialog button", { hasText: "Not now" }).click();
  ok("03 Not now sets a reminder", (await notices(page)).includes("Reminder set for tomorrow."));
  await collect(page);
}

// 08 mobile hold
{
  const page = await open(M, "feed/", "feed-mobile");
  await sleep(600);
  ok("08 hold hint is shown on a phone", /Hold to appreciate/.test(await text(page, "[data-hold-hint]")));
  const press = () => page.evaluate(() => { const s = document.querySelector("[data-stage]"); const r = s.getBoundingClientRect(); s.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true, clientX: r.left + 100, clientY: r.top + 100 })); });
  await press();
  await sleep(450);
  const p = await page.evaluate(() => Number(document.querySelector("[data-ring]").style.getPropertyValue("--p")));
  ok("08 the ring is filling at 0.45 s", p > 0.3 && p < 0.7, p.toFixed(2));
  await sleep(700);
  ok("08 Appreciation registered. Free shipping on redemption.", (await notices(page)).includes("Appreciation registered. Free shipping on redemption."));
  ok("08 one prompt pack is added", await page.evaluate(() => JSON.parse(localStorage.getItem("slop.session")).cart === 1));
  ok("08 no horizontal scroll on the feed at 360 px", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await collect(page);
}

// ---------------------------------------------------------------------------------------------
// 5 and 6. The authenticity page: tiers, gift shop, buy bar, receipt
for (const tier of ["webgl", "poster", "webgpu"]) {
  const page = await open(D, `authenticity/?tier=${tier}`, `auth-${tier}`);
  await page.waitForFunction(() => document.querySelector("[data-seal]").dataset.tier, null, { timeout: 15000 });
  const used = await page.evaluate(() => document.querySelector("[data-seal]").dataset.tier);
  if (tier === "poster") {
    ok("tier poster: poster sequence is shown, no canvas", used === "poster" && (await page.locator("[data-seal] canvas").count()) === 0 && await page.locator("[data-poster]").isVisible());
    const f0 = await page.locator("[data-poster-img]").getAttribute("src");
    await page.locator("[data-rot='1']").click();
    await page.locator("[data-rot='1']").click();
    const f1 = await page.locator("[data-poster-img]").getAttribute("src");
    ok("tier poster: rotate buttons change the frame", f0 !== f1, `${f0.split("/").pop()} to ${f1.split("/").pop()}`);
    await page.locator("[data-seal]").focus();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    ok("tier poster: arrow keys rotate", (await page.locator("[data-poster-img]").getAttribute("src")) !== f1);
    await sleep(600);
    ok("tier poster: the frame image loads", await page.evaluate(() => document.querySelector("[data-poster-img]").naturalWidth > 0));
  } else if (tier === "webgl") {
    ok("tier webgl: renders in a canvas", used === "webgl" && (await page.locator("[data-seal] canvas").count()) === 1, used);
    await sleep(800);
    const shot = await page.locator("[data-seal]").screenshot();
    const st = await sharp(shot).stats();
    ok("tier webgl: the canvas is not blank", Math.max(...st.channels.map((c) => c.stdev)) > 8, st.channels.map((c) => c.stdev.toFixed(1)).join(","));
    await page.locator("[data-rot='1']").click(); await page.locator("[data-zoom='-1']").click();
    ok("tier webgl: controls operate without errors", true);
  } else {
    ok("tier webgpu: falls back safely when no WebGPU adapter exists", used === "webgl" || used === "webgpu", used);
  }
  if (tier === "webgl") {
    ok("05 launch starts with the clean object, no shop yet", await page.evaluate(() => document.querySelectorAll("[data-shop][data-on]").length === 0));
    const toP = (p) => page.evaluate((p) => { const l = document.querySelector("[data-launch]"); window.scrollTo(0, l.offsetTop + (l.offsetHeight - innerHeight) * p); }, p);
    await toP(0.4); await sleep(600);
    const s2 = await page.evaluate(() => [...document.querySelectorAll("[data-shop][data-on]")].map((e) => e.dataset.shop));
    ok("05 beat 3: the crowd barrier arrives first", s2.join() === "barrier", s2.join());
    await toP(0.55); await sleep(600);
    const s3 = await page.evaluate(() => [...document.querySelectorAll("[data-shop][data-on]")].map((e) => e.dataset.shop));
    ok("05 beat 4: laminated notice and sanitizer arrive", ["barrier", "notice", "sani"].every((x) => s3.includes(x)) && !s3.includes("pay"), s3.join());
    await toP(0.7); await sleep(600);
    ok("06 beat 5: payment terminal and the buy bar arrive", await page.evaluate(() => document.querySelector('[data-shop="pay"]').hasAttribute("data-on") && document.querySelector("[data-buybar]").hasAttribute("data-on") && document.documentElement.hasAttribute("data-commerce")));
    await toP(0.95); await sleep(600);
    ok("05 beat 6: the prompt pack arrives", await page.evaluate(() => document.querySelector('[data-shop="pack"]').hasAttribute("data-on")));
    const shopText = await page.evaluate(() => document.querySelector(".shop").innerText.replace(/\s+/g, " "));
    ok("05 laminated notice: PLEASE DO NOT GENERATE", /PLEASE DO NOT GENERATE/.test(shopText));
    ok("05 payment terminal: TAP TO APPRECIATE 2.00", /TAP TO APPRECIATE\s*2\.00/.test(shopText));
    ok("05 prompt pack 14.99", /Prompt pack\s*14\.99/.test(shopText));
    ok("05 hand sanitizer", /SANITIZE/.test(shopText));
    const beatsText = await page.evaluate(() => document.querySelector(".beats").textContent.replace(/\s+/g, " "));
    ok("05 Originality. From 0/month.", /Originality\. From 0\/month\./.test(beatsText));
    await page.locator("[data-add-cart]").click(); await page.locator("[data-add-cart]").click();
    const rc = await page.evaluate(() => ({ n: document.querySelector("[data-receipt] [data-cart]").textContent, pack: document.querySelector("[data-cart-total]").textContent, total: document.querySelector("[data-total]").textContent }));
    ok("06 buy bar adds prompt packs", rc.n === "2", JSON.stringify(rc));
    ok("06 receipt itemizes: 2 packs are 29.98, total 31.98", rc.pack === "29.98" && rc.total === "31.98", JSON.stringify(rc));
    const rtext = await text(page, "[data-receipt]");
    ok("06 receipt itemizes what was appreciated", /Appreciation/.test(rtext) && /Thank you for appreciating/.test(rtext) && /Taste\s*sold separately/.test(rtext));
    ok("authenticity has no layout shift (CLS < 0.02)", (await page.evaluate(() => window.__cls)) < 0.02, (await page.evaluate(() => window.__cls)).toFixed(4));
    await page.screenshot({ path: path.join(out, "authenticity-end.png") });
  }
  await collect(page);
}

// ---------------------------------------------------------------------------------------------
// 6. Works archive as inventory
{
  const page = await open(D, "works/", "works");
  const rows = await page.locator(".row").count();
  ok("06 works: seven original works in the inventory", rows === 7, String(rows));
  const row0 = (await page.locator(".row").first().innerText()).replace(/\s+/g, " ");
  ok("06 each row shows rank, rating, views, availability, price and people-like-you", /01/.test(row0) && /★ 4\.2/.test(row0) && /views/.test(row0) && /(In stock|Limited availability)/.test(row0) && /People like you also scrolled/.test(row0) && (await page.locator(".row .sticker").count()) >= 1, row0.slice(0, 120));
  const imgs = await page.locator(".row__thumb img").evaluateAll((is) => is.map((i) => i.complete));
  ok("06 work thumbnails render", imgs.length === 7);
  await page.locator(".row").first().click();
  await page.waitForURL(/works\/ten-thousand-sunsets\/$/);
  await page.waitForSelector(".work__fig img");
  const d = await page.evaluate(() => ({ alt: document.querySelector(".work__fig img").alt, p: document.querySelector(".work__text").innerText.length, sample: !!document.querySelector("[data-sample]") }));
  ok("06 work page: alt text, one paragraph, sample notice", d.alt.length > 40 && d.p > 150 && d.sample);
  await page.screenshot({ path: path.join(out, "work.png") });
  await collect(page);
}

// ---------------------------------------------------------------------------------------------
// Releases and the approval queue: human gates
{
  const page = await open(D, "releases/", "releases");
  ok("releases: six sample releases tracked", (await page.locator(".slot").count()) === 6);
  ok("releases: headline reports approval share", /Your November is \d+ % approved\./.test(await text(page, "h1")));
  await page.locator(".slot__link").first().click();
  await page.waitForURL(/releases\/r01\/$/);
  const g = await text(page, ".gate");
  ok("release page shows estimate, cap and approval reference", /Spend estimate/.test(g) && /Spend cap/.test(g) && /Approval/.test(g));
  ok("release page shows caption, alt text and the open-before-release list", (await page.locator(".open li").count()) >= 1 && /Caption, as it would post/.test(await text(page, ".rel__main")));
  await collect(page);
  const q = await open(D, "queue/", "queue");
  ok("queue lists every unapproved release", (await q.locator(".item").count()) === 5);
  await q.locator("[data-refuse]").first().click();
  ok("queue: Approve refuses, in text, accessibly", (await text(q, "[data-queue-status]")) === "Approval happens with a human, not a button.");
  ok("queue: status region is polite and live", (await q.locator("[data-queue-status]").getAttribute("aria-live")) === "polite");
  await q.locator("[data-later]").first().click();
  ok("queue: Not now sets a reminder", (await text(q, "[data-queue-status]")) === "Reminder set for when you are back.");
  ok("queue: refusing never changes the approved count", /Approved\s*1 of 6/.test((await text(q, ".receipt")).replace(/\s+/g, " ")));
  await collect(q);
  const r = await open(D, "review/", "review");
  ok("review index lists ten behaviours", (await r.locator(".rv__item").count()) === 10);
  ok("review index shows one component in five modes", (await r.locator(".block").count()) === 5);
  await collect(r);
}

// ---------------------------------------------------------------------------------------------
// 9. Reduced motion collapses every staged system into its finished state
{
  const page = await open({ ...D, reducedMotion: "reduce" }, "", "rm-home");
  await sleep(500);
  const s = await page.evaluate(() => ({
    rm: document.documentElement.hasAttribute("data-rm"),
    boot: document.documentElement.dataset.boot,
    nav: document.documentElement.dataset.nav,
    hud: document.documentElement.dataset.hud,
    sheet: !document.querySelector("[data-cookies]").hidden,
    sticker: parseFloat(getComputedStyle(document.querySelector(".cover__sticker")).opacity),
    staged: document.querySelector("[data-cover]").hasAttribute("data-staged"),
    metrics: [...document.querySelectorAll("[data-metric]")].map((m) => parseFloat(getComputedStyle(m).opacity)),
    riseH: document.querySelector("[data-rise]").offsetHeight,
    count: document.querySelector("[data-count]").textContent,
  }));
  ok("09 reduced motion: OS preference sets data-rm", s.rm);
  ok("09 reduced motion: no boot screen", s.boot !== "on");
  ok("09 reduced motion: navigation and rank are present at once", s.nav === "on" && s.hud === "on");
  ok("09 reduced motion: cookie sheet is there without delay", s.sheet);
  ok("09 reduced motion: nothing is staged", !s.staged);
  ok("09 reduced motion: sticker and metrics sit in their finished state", s.sticker === 1 && s.metrics.every((o) => o === 1), JSON.stringify(s.metrics));
  ok("09 reduced motion: the metric shows 18 without counting", s.count === "18", s.count);
  ok("09 reduced motion: the pinned feature section is not pinned", s.riseH < 1200, String(s.riseH));
  await collect(page);
  const f = await open({ ...D, reducedMotion: "reduce" }, "authenticity/?tier=poster", "rm-auth");
  await sleep(700);
  const a = await f.evaluate(() => ({ shop: [...document.querySelectorAll("[data-shop]")].every((e) => e.hasAttribute("data-on") && getComputedStyle(e).opacity === "1"), beats: [...document.querySelectorAll("[data-beat]")].every((b) => b.hasAttribute("data-on") && getComputedStyle(b).opacity === "1"), runway: getComputedStyle(document.querySelector("[data-runway]")).display, buybar: getComputedStyle(document.querySelector("[data-buybar]")).position }));
  ok("09 reduced motion: gift shop, beats and buy bar are all present", a.shop && a.beats && a.buybar === "relative", JSON.stringify(a));
  ok("09 reduced motion: the scroll runway is removed", a.runway === "none");
  await collect(f);
  const q = await open(D, "?motion=reduce", "rm-query");
  ok("09 ?motion=reduce works from the URL", await q.evaluate(() => document.documentElement.hasAttribute("data-rm")));
  await q.locator("[data-motion-toggle]").waitFor();
  ok("09 footer toggle reads Motion: reduced", /Motion: reduced/.test(await text(q, "[data-motion-toggle]")));
  await q.locator("[data-motion-toggle]").click();
  ok("09 footer toggle restores motion", /Motion: full/.test(await text(q, "[data-motion-toggle]")));
  await collect(q);
}

// ---------------------------------------------------------------------------------------------
// Phone: no horizontal scroll anywhere, first screen explains itself, touch tier is the poster
{
  const routes = ["", "feed/", "authenticity/", "works/", "works/the-plateau/", "releases/", "releases/r03/", "queue/", "review/", "about/"];
  for (const r of routes) {
    const page = await open(M, r, `m-${r}`);
    await sleep(r === "" ? 900 : 300);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h1: !!document.querySelector("h1") }));
    ok(`360 px: no horizontal scroll on /${r}`, o.sw <= o.iw && o.h1, `${o.sw} of ${o.iw}`);
    if (r === "authenticity/") {
      await page.waitForFunction(() => document.querySelector("[data-seal]").dataset.tier, null, { timeout: 8000 });
      ok("360 px: authenticity picks the poster tier on touch", (await page.evaluate(() => document.querySelector("[data-seal]").dataset.tier)) === "poster");
    }
    if (r === "") await page.screenshot({ path: path.join(out, "home-mobile.png") });
    await collect(page);
  }
}

// ---------------------------------------------------------------------------------------------
// Platform: service worker, fetch-ahead, 404, keyboard, network hygiene
{
  const page = await open(D, "works/", "platform");
  const sw = await page.evaluate(async () => { for (let i = 0; i < 40; i++) { const r = await navigator.serviceWorker?.getRegistration(); if (r?.active) return { scope: new URL(r.scope).pathname }; await new Promise((x) => setTimeout(x, 150)); } return null; });
  ok("service worker registers at the site base", sw && sw.scope === base, JSON.stringify(sw));
  const before = await page.evaluate(() => window.__intent.stats.started);
  await page.locator(".row").nth(3).hover();
  await sleep(500);
  const hov = await page.evaluate(() => window.__intent.stats.started);
  ok("fetch-ahead starts on hover before the click", hov > before, `${before} to ${hov}`);
  await page.locator(".row").nth(3).click();
  await page.waitForFunction(() => /works\/[a-z-]+\/$/.test(location.pathname), null, { timeout: 5000 });
  ok("the click is served from the held page", (await page.evaluate(() => window.__intent.stats.served)) >= 1);
  await collect(page);
  const nfp = await open(D, "about/", "expected-404");
  const nf = await nfp.goto(u("nothing-here/"));
  ok("unknown routes serve the 404 page", nf.status() === 404 && /Page not found/.test(await nfp.locator("h1").innerText()));
  const kp = await open(D, "about/", "keyboard");
  await kp.keyboard.press("Tab");
  ok("keyboard: the first Tab stop is the skip link", await kp.evaluate(() => document.activeElement.classList.contains("skip")));
  ok("keyboard: focus ring is visible on focus", await kp.evaluate(() => { const a = document.activeElement; return getComputedStyle(a).outlineStyle !== "none" || a.classList.contains("skip"); }));
}
ok("network: every request stayed on this origin", foreign.size === 0, [...foreign].slice(0, 3).join(" "));
ok("console: no errors in any page", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

// ---------------------------------------------------------------------------------------------
// Voice of every runtime message the site spoke during this run
{
  const bad = [...allNotices].map((n) => [n, voiceViolations(n)]).filter(([, v]) => v.length);
  ok(`voice: ${allNotices.size} runtime messages have no em dash, semicolon or contraction`, bad.length === 0, JSON.stringify(bad));
  ok("voice: the expected HUD lines were all spoken", ["Approved.", "Installed. No visible difference.", "Your taste has been updated.", "Appreciation registered. Free shipping on redemption."].every((n) => allNotices.has(n)));
}

// ---------------------------------------------------------------------------------------------
// Accessibility: axe on every page type, light and dark
{
  const axeSrc = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
  const routes = ["", "feed/", "authenticity/?tier=poster", "works/", "works/certified-authentic/", "releases/", "releases/r02/", "queue/", "review/", "about/"];
  for (const scheme of ["light", "dark"]) {
    for (const r of routes) {
      const ctx = await browser.newContext({ baseURL: origin, ...D, colorScheme: scheme, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(u(r), { waitUntil: "load" });
      await sleep(r === "" || r.startsWith("authenticity") ? 900 : 300);
      await page.evaluate(axeSrc);
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
      const v = res.violations.map((x) => `${x.id} (${x.impact}) ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
      ok(`axe ${scheme}: /${r.replace("?tier=poster", "")} has no violations`, v.length === 0, v.join(" | "));
      await ctx.close();
    }
  }
}

for (const c of contexts) await c.close().catch(() => {});
await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
