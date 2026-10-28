// Real-browser verification in headless Google Chrome: the gallery front, the ten behaviours, the release tracker and
// approval queue, reduced motion, the certificate photograph, house join, layout, accessibility (axe, light and dark), network
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
const ok = (name, pass, detail = "") => {
  pass ? passed++ : failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  // In Actions a failure is also an annotation, so it can be read without the log.
  if (!pass && process.env.GITHUB_ACTIONS) console.log(`::error title=verify::${name}${detail ? "  " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, args: [] });
const allNotices = new Set();
const consoleErrors = [];
const foreign = new Set();
const contexts = [];

async function open(ctxOpts, route, tag, { settle = "load", evidence = null } = {}) {
  const opts = { evidence };
  for (const c of contexts.splice(0)) await c.close().catch(() => {});
  const ctx = await browser.newContext({ baseURL: origin, ...ctxOpts });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !tag.startsWith("expected")) consoleErrors.push(`${tag}: ${m.text()}`); });
  // Chrome rejects a view transition it skipped (fast keyboard navigation) with this exact error.
  // It is the browser cancelling an animation, not a page fault, so only that message is exempt.
  const skippedTransition = (e) => String(e).startsWith("InvalidStateError: Transition was aborted because of invalid state");
  page.on("pageerror", (e) => { if (!skippedTransition(e)) consoleErrors.push(`${tag}: ${e}`); });
  page.on("request", (r) => { const x = new URL(r.url()); if (!/^(data|blob):/.test(r.url()) && x.origin !== origin) foreign.add(r.url()); });
  // evidence.json is written by CI after this run. Without a file the receipt must say so, and a 404 would be a console error.
  await ctx.route("**/evidence.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: opts.evidence ? JSON.stringify(opts.evidence) : "{}" }));
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
const rankOf = async (page) => Number(((await hudId(page)) || "").match(/(\d+)/)?.[1]);
const D = { viewport: { width: 1280, height: 800 } };
const M = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

// ---------------------------------------------------------------------------------------------
// 1. Home: the front of the gallery
{
  const page = await open(D, "", "home");
  await sleep(300);
  ok("01 no boot screen, the gallery is open at once", await page.evaluate(() => !document.querySelector("[data-boot]") && document.documentElement.dataset.boot !== "on"));
  { const n = await page.locator("#house-menu-room + ul a").count(); ok("01 navigation is present at once", n === 4, String(n)); }
  await page.waitForSelector("[data-cookies][data-on]", { timeout: 6000 });
  const btns = await page.locator("[data-cookies] [data-accept]").allInnerTexts();
  ok("01 cookie sheet offers Accept all and Accept all", btns.length === 2 && btns.every((b) => b.trim() === "Accept all"), JSON.stringify(btns));
  ok("01 visitor line reads Visitor no. 184 today", (await hudId(page)).trim() === "Visitor no. 184 today", await hudId(page));
  const hero = await page.evaluate(() => { const i = document.querySelector(".cover__img img"); return { w: i.naturalWidth, h: i.naturalHeight, alt: i.alt }; });
  ok("01 hero still is loaded with alt text", hero.w > 0 && hero.alt.length > 40, `${hero.w}px`);
  ok("01 the desktop hero is the full widescreen still", hero.w / hero.h > 1.6, `${hero.w}x${hero.h}`);
  ok("01 sticker reads Free. Limited availability.", /Free\./.test(await text(page, ".cover__sticker")) && /Limited availability\./.test(await text(page, ".cover__sticker")));
  const label = (await text(page, ".cover__label")).replace(/\s+/g, " ");
  ok("01 wall label lists medium, edition, prompt and record", /Generated image/.test(label) && /1 of 48,291/.test(label) && /ultra realistic, 8k, trending, masterpiece/.test(label) && /Issue 001/.test(label), label.slice(0, 120));
  ok("01 the label sits on paper, beside the plate and above the fold", await page.evaluate(() => { const l = document.querySelector(".cover__label").getBoundingClientRect(); const f = document.querySelector(".cover__stage").getBoundingClientRect(); return (l.left >= f.right - 1 || l.top >= f.bottom - 1) && l.bottom < innerHeight && f.bottom < innerHeight; }));
  ok("01 under the wordmark: A satire of AI slop, hung like an exhibition.", (await text(page, ".cover__pos")).trim() === "A satire of AI slop, hung like an exhibition.");
  ok("01 the plate is at most 62 vh tall", await page.evaluate(() => document.querySelector(".cover__img img").getBoundingClientRect().height <= innerHeight * 0.62 + 1));
  const v1 = await text(page, ".cover__meta [data-viewed]");
  ok("view counter starts at a plausible formatted number", /^Viewed 1,204,\d{3} times$/.test(v1), v1);
  const n1 = Number(v1.replace(/\D/g, ""));
  await sleep(4500);
  ok("view counter ticks up on its own", Number((await text(page, ".cover__meta [data-viewed]")).replace(/\D/g, "")) > n1);
  ok("house crumb: wordmark links home and the room is the current page", (await page.locator(".house-wordmark").getAttribute("href")) === "/" && (await page.locator(".house-crumb-room").getAttribute("aria-current")) === "page" && /Slop Editorial/.test(await text(page, ".house-crumb-room")));
  ok("house crumb: links that leave the room carry data-astro-reload", await page.evaluate(() => [...document.querySelectorAll('.house-crumb a[href^="/"], .house-footer a[href^="/"]')].filter((a) => !a.getAttribute("href").startsWith("/slop-editorial/")).every((a) => a.hasAttribute("data-astro-reload"))));
  const houseLinks = await page.locator(".house-crumb a, .house-menu a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok("house crumb and menu carry email, GitHub and LinkedIn", ["mailto:lim.ggreg@outlook.com", "https://github.com/monsieurgregorio2001-coder", "https://www.linkedin.com/in/garfield-lim-8239242a9"].every((h) => houseLinks.includes(h)), houseLinks.join(" "));
  ok("house footer is pinned to house 2.0.1", /House 2\.0\.1/.test(await text(page, ".house-footer")) && (await page.locator('link[href="/house/2.0.1/house.css"]').count()) === 1);
  ok("room tokens: yellow is a fill, the text ink is #7D5E07 in light", await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return c.getPropertyValue("--room").trim().toLowerCase() === "#f2cf3b" && c.getPropertyValue("--room-ink").trim().toLowerCase() === "#7d5e07"; }));
  ok("the static hero is the room hero: #room-hero holds the plate", await page.evaluate(() => !!document.querySelector("#room-hero img[fetchpriority=high]")));
  ok("footer states Built by Garfield Greg Lim III", /Built by Garfield Greg Lim III/.test(await text(page, ".foot")));
  const plain = await page.locator("[data-house-plain]").first().getAttribute("href");
  const md = await page.request.get(origin + plain);
  ok("the Plain text link serves a plain-text twin of the page", md.status() === 200 && /^# Slop Editorial/.test(await md.text()), `${plain} ${md.status()}`);
  ok("footer is honest about the image model", /generated from a written brief with an image model/.test(await text(page, ".foot")));
  const navHrefs = await page.locator("#house-menu-room + ul a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok("navigation links carry the /slop-editorial/ base", navHrefs.filter((h) => !h.startsWith("http")).every((h) => h.startsWith(base)), navHrefs.join(" "));
  ok("no horizontal scroll on home at 1280", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok("the room is paper by default", bg === "rgb(250, 248, 244)", bg);
  ok("home has no layout shift at all, cookie sheet included (CLS 0)", (await page.evaluate(() => window.__cls)) < 0.0005, String((await page.evaluate(() => window.__cls)).toFixed(4)));
  ok("the cookie sheet is an overlay, fixed over the page", await page.evaluate(() => getComputedStyle(document.querySelector("[data-cookies]")).position === "fixed"));
  // 04 on home: looking
  await page.evaluate(() => document.querySelector("[data-stage]").scrollIntoView({ block: "center" }));
  await page.mouse.move(400, 300);
  await sleep(3600);
  ok("04 home dwell: You have been looking for ... That is above average.", /You have been looking for [\d.]+ s\. That is above average\./.test(await page.locator("[data-dwell]").innerText()));
  ok("04 home dwell: Still looking. Interest logged.", (await notices(page)).includes("Still looking. Interest logged."));
  ok("now showing lists three works with plates", (await page.locator(".grid--three .tile").count()) === 3 && (await page.locator(".grid--three .plate").allInnerTexts()).join() === "02,06,09");
  await page.screenshot({ path: path.join(out, "home.png"), fullPage: true });
  await collect(page);
}

// 1b. Home: consent, then the graphite room from the footer
{
  const page = await open(D, "", "home-consent");
  await page.waitForSelector("[data-cookies][data-on]", { timeout: 6000 });
  await page.locator("[data-cookies] [data-accept]").nth(1).click();
  ok("01 consent notice is spoken", (await notices(page)).includes("Preferences saved. Measurement continues."));
  ok("01 consent sets no cookie", (await page.context().cookies()).length === 0);
  await page.locator("[data-theme-toggle]").click();
  await sleep(900);
  const dark = await page.evaluate(() => ({ attr: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, btn: document.querySelector("[data-theme-toggle]").textContent }));
  ok("room toggle switches to graphite, never navy", dark.attr === "dark" && dark.bg === "rgb(20, 19, 22)" && /graphite/.test(dark.btn), JSON.stringify(dark));
  ok("graphite carries into the house crumb", await page.evaluate(() => getComputedStyle(document.querySelector(".house-crumb")).backgroundColor !== "rgb(250, 248, 244)" && getComputedStyle(document.querySelector(".house-crumb")).color !== "rgb(23, 23, 27)"));
  await page.reload({ waitUntil: "load" });
  ok("the room survives a reload", await page.evaluate(() => document.documentElement.dataset.theme === "dark"));
  await page.locator("[data-theme-toggle]").click();
  await sleep(700);
  ok("room toggle restores paper", await page.evaluate(() => document.documentElement.dataset.theme === "light" && getComputedStyle(document.body).backgroundColor === "rgb(250, 248, 244)"));
  await collect(page);
  // The room follows the OS colour scheme. The toggle overrides it either way.
  const osDark = await open({ ...D, colorScheme: "dark" }, "", "home-os-dark");
  await sleep(300);
  const o1 = await osDark.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, btn: document.querySelector("[data-theme-toggle]").textContent, attr: document.documentElement.dataset.theme ?? null, ink: getComputedStyle(document.documentElement).getPropertyValue("--room-ink").trim().toLowerCase() }));
  ok("OS dark: the room is graphite with no stored choice", o1.bg === "rgb(20, 19, 22)" && /graphite/.test(o1.btn) && o1.attr === null, JSON.stringify(o1));
  ok("OS dark: the room hue is the dark yellow, f6d653", o1.ink === "#f6d653", o1.ink);
  await osDark.locator("[data-theme-toggle]").click();
  await sleep(700);
  ok("OS dark: the toggle overrides to paper", await osDark.evaluate(() => document.documentElement.dataset.theme === "light" && getComputedStyle(document.body).backgroundColor === "rgb(250, 248, 244)"));
  const osNoJs = await browser.newContext({ baseURL: origin, ...D, colorScheme: "dark", javaScriptEnabled: false });
  const njp = await osNoJs.newPage();
  await njp.goto(u(""), { waitUntil: "load" });
  ok("OS dark with JavaScript off: the room is still graphite", (await njp.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(20, 19, 22)");
  await osNoJs.close();
  await collect(osDark);
}

// ---------------------------------------------------------------------------------------------
// 3. The feed page: interface joke, embarrassment, view transition
{
  const page = await open(D, "", "feed-flow");
  await page.evaluate(() => { window.__marker = "same-document"; });
  await page.mouse.move(300, 300);
  await sleep(600);
  await page.locator("[data-hero-link]").click({ position: { x: 300, y: 200 } });
  await page.waitForFunction(() => location.pathname.endsWith("/feed/"), null, { timeout: 8000 });
  await page.waitForSelector("[data-hero-img]");
  ok("view transition: navigation kept the same document", (await page.evaluate(() => window.__marker)) === "same-document");
  ok("feed: Approved. is spoken on arrival", (await notices(page)).includes("Approved."));
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
  ok("07 every action improves the visitor number", (await rankOf(page)) < before, `${before} to ${await rankOf(page)}`);

  // 02 beautiful, then wrong: the label metrics
  await page.evaluate(() => document.querySelector(".spec__metrics").scrollIntoView({ block: "center" }));
  await sleep(1800);
  const m = await page.evaluate(() => [...document.querySelectorAll(".spec__metrics .metric")].map((e) => e.innerText.replace(/\s+/g, " ")));
  ok("02 Engagement improved 18 %", /18\s*%/.test(m[0]) && /Engagement improved/.test(m[0]), m[0]);
  ok("02 Preferred by people who skip", /Preferred by people who skip/.test(m[1]), m[1]);
  ok("02 This image performed Well", /Well/.test(m[2]), m[2]);
  ok("02 the feature line reads This image performed well", (await notices(page)).includes("This image performed well."));
  const lbl = (await text(page, ".spec__dl")).replace(/\s+/g, " ");
  ok("02 the label reads like a wall card: medium, edition, prompt, price", /Generated image/.test(lbl) && /1 of 48,291/.test(lbl) && /masterpiece/.test(lbl) && /Limited availability/.test(lbl));

  // description edit
  await page.evaluate(() => document.querySelector("[data-cost]").scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => document.querySelector("[data-ins]").hasAttribute("data-on"), null, { timeout: 5000 });
  ok("one interface edit: the decisive word is inserted after reading", (await text(page, "[data-cost-text]")).includes("six"));
  ok("feed first screen explains itself (the still is visible)", await page.evaluate(() => { scrollTo(0, 0); const h = document.querySelector("[data-hero-img]").getBoundingClientRect(); return h.bottom > 0 && h.top < innerHeight; }));

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
  ok("08 the ring is filling at 0.45 s", p > 0.2 && p < 0.95, p.toFixed(2));
  await sleep(700);
  ok("08 Appreciation registered. Free shipping on redemption.", (await notices(page)).includes("Appreciation registered. Free shipping on redemption."));
  ok("08 one prompt pack is added", await page.evaluate(() => JSON.parse(localStorage.getItem("slop.session")).cart === 1));
  ok("08 no horizontal scroll on the feed at 360 px", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await collect(page);
}

// ---------------------------------------------------------------------------------------------
// 5 and 6. The authenticity page: the certificate photograph, gift shop, buy bar, receipt
{
  const page = await open(D, "authenticity/", "auth");
  await page.waitForSelector("[data-seal] img");
  await sleep(500);
  ok("certificate: the generated photograph is shown", await page.evaluate(() => { const i = document.querySelector("[data-seal] img"); return i.naturalWidth > 0 && /Certificate of Human Touch/.test(i.alt) && /seal-poster-800\.webp$/.test(i.currentSrc); }));
  ok("certificate: no canvas and no 3D library on the page", (await page.locator("canvas").count()) === 0 && !(await page.evaluate(() => performance.getEntriesByType("resource").some((r) => /three|webgl/i.test(r.name)))));
  ok("certificate: no object controls are left", (await page.locator("[data-ctl], [data-rot], [data-zoom]").count()) === 0);
  ok("05 launch starts with the clean object, no shop yet", await page.evaluate(() => document.querySelectorAll("[data-shop][data-on]").length === 0));
  const toP = (p) => page.evaluate((p) => { const l = document.querySelector("[data-launch]"); window.scrollTo(0, l.offsetTop + (l.offsetHeight - innerHeight) * p); }, p);
  const sweep = () => page.evaluate(() => Number(document.querySelector("[data-seal]").style.getPropertyValue("--sweep")));
  await toP(0.1); await sleep(300);
  const sw1 = await sweep();
  await toP(0.4); await sleep(600);
  ok("certificate: the light sweep follows the scroll", (await sweep()) > sw1 + 0.15, `${sw1.toFixed(2)} to ${(await sweep()).toFixed(2)}`);
  ok("certificate: the sweep is a CSS gradient over the plate", await page.evaluate(() => getComputedStyle(document.querySelector(".seal__plate"), "::after").backgroundImage.includes("linear-gradient")));
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
  ok("05 payment terminal: TAP TO APPRECIATE USD 2.00", /TAP TO APPRECIATE\s*USD 2\.00/.test(shopText));
  ok("05 prompt pack USD 14.99", /Prompt pack\s*USD 14\.99/.test(shopText));
  ok("05 Extra finger, USD 2.99", /Extra finger\s*USD 2\.99/.test(shopText));
  ok("05 Watermark remover remover", /Watermark remover remover/.test(shopText));
  ok("05 garbled sanitizer label stays garbled", /APPRECIATTING/.test(shopText));
  ok("05 hand sanitizer", /SANITIZE/.test(shopText));
  const beatsText = await page.evaluate(() => document.querySelector(".beats").textContent.replace(/\s+/g, " "));
  ok("05 Originality. From 0/month.", /Originality\. From 0\/month\./.test(beatsText));
  await page.locator("[data-add-cart]").click(); await page.locator("[data-add-cart]").click();
  const rc = await page.evaluate(() => ({ n: document.querySelector("[data-receipt] [data-cart]").textContent, pack: document.querySelector("[data-cart-total]").textContent, total: document.querySelector("[data-total]").textContent }));
  ok("06 buy bar adds prompt packs", rc.n === "2", JSON.stringify(rc));
  ok("06 receipt itemizes: 2 packs are 29.98, total 31.98", rc.pack === "29.98" && rc.total === "31.98", JSON.stringify(rc));
  const rtext = await text(page, "[data-receipt]");
  ok("06 receipt itemizes what was appreciated", /Appreciation/.test(rtext) && /Watermark remover remover/.test(rtext) && /Thank you for appreciating/.test(rtext) && /Taste\s*sold separately/.test(rtext));
  ok("06 receipt states its currency", /All amounts in USD\./.test(rtext));
  ok("authenticity has no layout shift (CLS 0)", (await page.evaluate(() => window.__cls)) < 0.0005, (await page.evaluate(() => window.__cls)).toFixed(4));
  await page.screenshot({ path: path.join(out, "authenticity-end.png") });
  await collect(page);
}

// The spend cap toy and its receipt, on the Method page only
{
  const page = await open(D, "about/", "spend");
  await page.waitForSelector("[data-spend][data-bound]");
  const lab = await text(page, "#spend-cap");
  ok("toy label: Runs the pipeline's cost check in your browser. Generates nothing.", lab.includes("Runs the pipeline's cost check in your browser. Generates nothing."));
  ok("record label: Mock provider run. No images were generated.", (await text(page, ".rec")).includes("Mock provider run. No images were generated."));
  const cli = async () => (await page.locator("[data-out] code.cli").allInnerTexts()).map((t) => t.trim());
  ok("default run is refused with the CLI's exact string, values substituted", (await cli())[0] === "slopgen: estimated $0.71 exceeds --max-usd 0.50; raise the cap or narrow with --only", (await cli())[0]);
  ok("the result sits in a polite status region", (await page.locator("[data-out]").getAttribute("role")) === "status" && (await page.locator("[data-out]").getAttribute("aria-live")) === "polite");
  await page.locator("#cap-cap").fill("5");
  const under = await cli();
  ok("under the cap it shows the CLI's own approval requirement", /Under the cap/.test(await text(page, "[data-out]")) && under[0] === "slopgen: estimated spend $0.71 on fal; rerun with --yes to proceed" && under[1] === "slopgen: paid runs need --approval-ref naming the recorded human approval", under.join(" | "));
  ok("the command shown carries the cap", under[2].includes("--max-usd 5.00") && under[2].includes("--approval-ref"));
  await page.locator("#cap-cap").fill("-1");
  ok("a negative cap gets the CLI's words", (await cli())[0] === "slopgen: --max-usd must be a finite, non-negative amount", (await cli())[0]);
  await page.locator("#cap-plates").fill("");
  ok("empty plates ask again and mark the field invalid", /Check this input/.test(await text(page, "[data-out]")) && (await page.locator("#cap-plates").getAttribute("aria-invalid")) === "true");
  await page.locator("[data-reset]").click();
  await sleep(100);
  ok("Reset restores the default run", (await cli())[0].includes("exceeds --max-usd 0.50") && (await page.locator("#cap-plates").inputValue()) === "9");
  await page.locator("#cap-model").selectOption({ value: "mock|mock-t2i" });
  ok("the free mock provider needs no cap and no approval", /Free to run/.test(await text(page, "[data-out]")));
  await page.locator("#cap-model").selectOption({ value: "replicate|black-forest-labs/flux-dev" });
  await page.locator("#cap-plates").fill("20");
  await page.locator("#cap-rerolls").fill("3");
  ok("80 jobs on replicate at USD 0.025 total USD 2.00 against the 0.50 cap", (await cli())[0] === "slopgen: estimated $2.00 exceeds --max-usd 0.50; raise the cap or narrow with --only", (await cli())[0]);
  await page.locator("#cap-plates").focus();
  await page.keyboard.press("Tab");
  ok("keyboard: Tab moves through the fields in order with a visible focus ring", await page.evaluate(() => document.activeElement.id === "cap-rerolls" && getComputedStyle(document.activeElement).outlineStyle !== "none"));
  const targets = await page.evaluate(() => [...document.querySelectorAll("#spend-cap input, #spend-cap select, #spend-cap button, .hb a, #receipt a")].filter((e) => e.getBoundingClientRect().height < 43.5).map((e) => e.id || e.className));
  ok("toy controls are 44 px tall", targets.length === 0, targets.join(","));
  ok("the receipt without evidence says not measured yet", (await page.locator("#receipt .is-missing").count()) >= 4 && /not measured yet/.test(await text(page, "#receipt")));
  ok("How this was built has three columns and the proposed label", (await page.locator(".hb__col").count()) === 3 && /Proposed by Claude, waiting for Garfield's review/.test(await text(page, "#how")));
  await page.screenshot({ path: path.join(out, "about-toy.png"), fullPage: true });
  await collect(page);
  const withEvidence = {
    schema: 1, commit: "abc1234", ran_at: "2026-10-28T12:00:00Z", runner: "local run, Node 22",
    tests: [{ id: "unit", label: "Site unit tests", passed: 40, total: 40, command: "npm test" }, { id: "parity", label: "Spend cap parity fixtures, Python and TypeScript", passed: 1536, total: 1536, command: "npm test" }],
    evals: [], budgets: [{ id: "js-home-gz", limit: 15360, actual: 10240 }],
    limits: ["Paid providers were tested against fakes only.", "The current nine plates have no generation record."],
  };
  const r = await open(D, "about/", "receipt", { evidence: withEvidence });
  await r.waitForFunction(() => !document.querySelector('[data-slot="tests"] .is-missing'), null, { timeout: 4000 });
  const rt = await text(r, "#receipt");
  ok("the receipt prints what evidence.json holds", /40 of 40/.test(rt) && /1536 of 1536/.test(rt) && /10\.0 KB/.test(rt) && /None\./.test(rt));
  ok("limits: Paid providers were tested against fakes only.", rt.includes("Paid providers were tested against fakes only."));
  ok("limits: The current nine plates have no generation record.", rt.includes("The current nine plates have no generation record."));
  await collect(r);
  const wall = await open(D, "works/make-it-pop/", "wall");
  ok("the toy is never on a wall label", (await wall.locator("[data-spend], #spend-cap").count()) === 0 && !/spend cap/i.test(await wall.locator("main").innerText()));
  const home = await open(D, "", "home-no-toy");
  ok("the toy is not on the home page either", (await home.locator("[data-spend]").count()) === 0);
  const njs = await browser.newContext({ baseURL: origin, ...D, javaScriptEnabled: false });
  const np = await njs.newPage();
  await np.goto(u("about/"));
  ok("JavaScript off: the default run and the record are still on the page", /refused/i.test(await np.locator("[data-out]").innerText()) && /MOCK-REF-001/.test(await np.locator(".rec").innerText()));
  await njs.close();
}

// ---------------------------------------------------------------------------------------------
// 6. Works as an exhibition
{
  const page = await open(D, "works/", "works");
  const tiles = await page.locator(".tile").count();
  ok("06 works: nine pieces hang in the exhibition", tiles === 9, String(tiles));
  const plates = await page.locator(".tile .plate").allInnerTexts();
  ok("06 plates run 01 to 09 in order", plates.join() === "01,02,03,04,05,06,07,08,09", plates.join());
  const t1 = (await page.locator(".tile").nth(1).innerText()).replace(/\s+/g, " ");
  ok("06 each label shows plate, title, rating, views and price", /02/.test(t1) && /★ 4\.2/.test(t1) && /views/.test(t1) && /(Free|USD \d+\.\d\d)/.test(t1), t1);
  ok("06 no yellow sticker on the exhibition page", (await page.locator(".sticker").count()) === 0);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await sleep(1200);
  const imgs = await page.locator(".tile img").evaluateAll((is) => is.map((i) => i.naturalWidth > 0));
  ok("06 every work image renders", imgs.length === 9 && imgs.every(Boolean), imgs.join());
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator(".tile").nth(1).click();
  await page.waitForURL(/works\/six-fingers-five-stars\/$/);
  await page.waitForSelector(".work__fig img");
  const d = await page.evaluate(() => ({ alt: document.querySelector(".work__fig img").alt, p: document.querySelector(".work__text").innerText.length, sample: !!document.querySelector("[data-sample]"), plate: document.querySelector(".work__row .plate").textContent, nav: [...document.querySelectorAll(".work__nav a")].map((a) => a.textContent.replace(/\s+/g, " ").trim()) }));
  ok("06 work page: alt text, one paragraph, sample notice", d.alt.length > 40 && d.p > 150 && d.sample);
  ok("06 work page carries its plate and previous, index and next", d.plate === "02" && d.nav.length === 3 && /Previous\s*01 The Still/.test(d.nav[0]) && /Next\s*03/.test(d.nav[2]), JSON.stringify(d.nav));
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
    sheet: !document.querySelector("[data-cookies]").hidden,
    sticker: parseFloat(getComputedStyle(document.querySelector(".cover__sticker")).opacity),
  }));
  ok("09 reduced motion: OS preference sets data-rm", s.rm);
  ok("09 reduced motion: cookie sheet is there without delay", s.sheet);
  const rv = await text(page, ".cover__meta [data-viewed]");
  await sleep(4500);
  ok("09 reduced motion: view counter is the same formatted number and holds still", /^Viewed 1,204,331 times$/.test(rv) && (await text(page, ".cover__meta [data-viewed]")) === rv, rv);
  ok("09 reduced motion: the sticker sits in its finished state", s.sticker === 1);
  await collect(page);
  const f = await open({ ...D, reducedMotion: "reduce" }, "authenticity/", "rm-auth");
  await sleep(700);
  const a = await f.evaluate(() => ({ shop: [...document.querySelectorAll("[data-shop]")].every((e) => e.hasAttribute("data-on") && getComputedStyle(e).opacity === "1"), beats: [...document.querySelectorAll("[data-beat]")].every((b) => b.hasAttribute("data-on") && getComputedStyle(b).opacity === "1"), runway: getComputedStyle(document.querySelector("[data-runway]")).display, buybar: getComputedStyle(document.querySelector("[data-buybar]")).position }));
  ok("09 reduced motion: gift shop, beats and buy bar are all present", a.shop && a.beats && a.buybar === "relative", JSON.stringify(a));
  ok("09 reduced motion: the scroll runway is removed", a.runway === "none");
  await collect(f);
  const narrow = await open({ viewport: { width: 360, height: 740 }, reducedMotion: "reduce" }, "authenticity/", "rm-auth-360");
  await sleep(700);
  const ov = await narrow.evaluate(() => { const bad = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(e).position !== "fixed").slice(0, 3).map((e) => e.className || e.tagName); return { sw: document.documentElement.scrollWidth, iw: document.documentElement.clientWidth, bad }; });
  ok("09 reduced motion: no horizontal overflow on /authenticity/ at 360 px", ov.sw <= ov.iw, JSON.stringify(ov));
  await collect(narrow);
  const calm = await open(D, "about/", "calm-switch");
  await calm.locator("[data-house-calm]").last().click();
  await sleep(200);
  ok("09 the house Calm switch also reduces this room's motion", await calm.evaluate(() => document.documentElement.dataset.motion === "calm" && document.documentElement.hasAttribute("data-rm")));
  await calm.locator("[data-house-calm]").last().click();
  await sleep(200);
  ok("09 turning Calm off restores the room's motion", await calm.evaluate(() => document.documentElement.dataset.motion === "full" && !document.documentElement.hasAttribute("data-rm")));
  await collect(calm);
  const q = await open(D, "?motion=reduce", "rm-query");
  ok("09 ?motion=reduce works from the URL", await q.evaluate(() => document.documentElement.hasAttribute("data-rm")));
  await q.locator("[data-motion-toggle]").waitFor();
  ok("09 footer toggle reads Motion: reduced", /Motion: reduced/.test(await text(q, "[data-motion-toggle]")));
  await q.locator("[data-motion-toggle]").click();
  ok("09 footer toggle restores motion", /Motion: full/.test(await text(q, "[data-motion-toggle]")));
  await collect(q);
}

// ---------------------------------------------------------------------------------------------
// Phone: no horizontal scroll anywhere, first screen explains itself, 44 px targets
{
  const routes = ["", "feed/", "authenticity/", "works/", "works/make-it-pop/", "releases/", "releases/r03/", "queue/", "review/", "about/"];
  for (const r of routes) {
    const page = await open(M, r, `m-${r}`);
    await sleep(r === "" ? 900 : 300);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: 360, h1: !!document.querySelector("h1") }));
    ok(`360 px: no horizontal scroll on /${r}`, o.sw <= o.iw && o.h1, `${o.sw} of ${o.iw}`);
    const small = await page.evaluate(() => [...document.querySelectorAll(".house-crumb a, .house-crumb button, .foot button, .foot__links a")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height < 43.5; }).map((e) => `${e.textContent.trim().slice(0, 14)} ${Math.round(e.getBoundingClientRect().height)}px`));
    ok(`360 px: header and footer targets are 44 px on /${r}`, small.length === 0, small.join(", "));
    const hdr = await page.evaluate(() => { const c = document.querySelector(".house-crumb").getBoundingClientRect(); return c.height; });
    ok(`360 px: the house header is one row on /${r}`, hdr <= 53, String(hdr));
    if (r === "" || r === "authenticity/") {
      await sleep(3200);
      const cls = await page.evaluate(() => window.__cls);
      ok(`360 px: no layout shift on /${r}, cookie sheet included (CLS 0)`, cls < 0.0005, cls.toFixed(4));
    }
    if (r === "") await page.screenshot({ path: path.join(out, "home-mobile.png") });
    await collect(page);
  }
}

// 360 px on a plain desktop-style viewport, in full motion and in Calm: nothing may be wider than the screen.
{
  const routes = ["", "feed/", "authenticity/", "works/", "works/make-it-pop/", "releases/", "releases/r03/", "queue/", "review/", "about/"];
  for (const rm of ["no-preference", "reduce"]) for (const r of routes) {
    const page = await open({ viewport: { width: 360, height: 740 }, reducedMotion: rm }, r, `w-${rm}-${r}`);
    await sleep(r === "" ? 700 : 250);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`360 px ${rm === "reduce" ? "Calm" : "full motion"}: nothing wider than the screen on /${r}`, o.sw <= o.cw, `${o.sw} of ${o.cw}`);
  }
  const wide = await open({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }, "authenticity/", "w-1440-calm");
  await sleep(500);
  ok("1440 px Calm: nothing wider than the screen on /authenticity/", await wide.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
}

// ---------------------------------------------------------------------------------------------
// Platform: service worker, fetch-ahead, 404, keyboard, network hygiene
{
  const page = await open(D, "works/", "platform");
  const sw = await page.evaluate(async () => { for (let i = 0; i < 40; i++) { const r = await navigator.serviceWorker?.getRegistration(); if (r?.active) return { scope: new URL(r.scope).pathname }; await new Promise((x) => setTimeout(x, 150)); } return null; });
  ok("service worker registers at the site base", sw && sw.scope === base, JSON.stringify(sw));
  const before = await page.evaluate(() => window.__intent.stats.started);
  await page.locator(".tile").nth(3).hover();
  await sleep(500);
  const hov = await page.evaluate(() => window.__intent.stats.started);
  ok("fetch-ahead starts on hover before the click", hov > before, `${before} to ${hov}`);
  await page.locator(".tile").nth(3).click();
  await page.waitForFunction(() => /works\/[a-z-]+\/$/.test(location.pathname), null, { timeout: 5000 });
  ok("the click is served from the held page", (await page.evaluate(() => window.__intent.stats.served)) >= 1);
  await collect(page);
  const nfp = await open(D, "about/", "expected-404");
  const nf = await nfp.goto(u("nothing-here/"));
  ok("unknown routes serve the house 404 page", nf.status() === 404 && /This room is not built\./.test(await nfp.locator("h1").innerText()) && (await nfp.locator(".house-crumb").count()) === 1);
  const kp = await open(D, "about/", "keyboard");
  await kp.route(origin + "/", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>hub</h1>" }));
  await kp.keyboard.press("Tab");
  ok("keyboard: the first Tab stop is the skip link", await kp.evaluate(() => document.activeElement.classList.contains("house-skip")));
  await kp.keyboard.press("Tab");
  ok("keyboard: the next stop is the house crumb, with a visible focus ring", await kp.evaluate(() => { const a = document.activeElement; return !!a.closest(".house-crumb") && getComputedStyle(a).outlineStyle !== "none"; }));
  await kp.goto(u("about/"));
  await kp.locator(".house-menu-btn").focus();
  await kp.keyboard.press("Enter");
  await sleep(300);
  ok("keyboard: Enter opens the house menu and Esc closes it", (await kp.evaluate(() => document.getElementById("house-menu").matches(":popover-open"))) && (await (async () => { await kp.keyboard.press("Escape"); await sleep(200); return kp.evaluate(() => !document.getElementById("house-menu").matches(":popover-open")); })()));
  await kp.goto(u("about/"));
  await kp.evaluate(() => { document.querySelector(".house-crumb").dataset.marker = "kept"; });
  await kp.locator(".house-menu-btn, .house-crumb button").first().click();
  await kp.locator("#house-menu a", { hasText: "Works" }).click();
  await kp.waitForURL(/works\/$/);
  ok("the house crumb survives a page change in the same document", await kp.evaluate(() => document.querySelector(".house-crumb").dataset.marker === "kept"));
  await kp.evaluate(() => { window.__still = "same-document"; });
  const nav = kp.waitForEvent("framenavigated");
  await kp.locator(".house-wordmark").click();
  await nav;
  ok("the wordmark leaves the room with a real browser navigation", await kp.evaluate(() => window.__still === undefined));
}
ok("network: every request stayed on this origin", foreign.size === 0, [...foreign].slice(0, 3).join(" "));
ok("console: no errors in any page", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

// ---------------------------------------------------------------------------------------------
// Voice of every runtime message the site spoke during this run
{
  const bad = [...allNotices].map((n) => [n, voiceViolations(n)]).filter(([, v]) => v.length);
  ok(`voice: ${allNotices.size} runtime messages have no em dash, semicolon or contraction`, bad.length === 0, JSON.stringify(bad));
  ok("voice: the expected visitor lines were all spoken", ["Approved.", "Installed. No visible difference.", "Your taste has been updated.", "Appreciation registered. Free shipping on redemption.", "This image performed well."].every((n) => allNotices.has(n)), [...allNotices].join(" | ").slice(0, 300));
}

// ---------------------------------------------------------------------------------------------
// Accessibility: axe on every page type, light and dark
{
  const axeSrc = await readFile(path.resolve("node_modules/axe-core/axe.min.js"), "utf8");
  const routes = ["", "feed/", "authenticity/", "works/", "works/why-do-pictures-never-trend/", "releases/", "releases/r02/", "queue/", "review/", "about/"];
  for (const [vw, vh] of [[390, 844], [1440, 900]]) for (const scheme of ["light", "dark"]) {
    for (const r of routes) {
      const ctx = await browser.newContext({ baseURL: origin, viewport: { width: vw, height: vh }, colorScheme: scheme, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(u(r), { waitUntil: "load" });
      await sleep(r === "" || r.startsWith("authenticity") ? 900 : 300);
      await page.evaluate(axeSrc);
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
      const v = res.violations.map((x) => `${x.id} (${x.impact}) ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
      ok(`axe ${scheme} ${vw}: /${r} has no violations`, v.length === 0, v.join(" | "));
      await ctx.close();
    }
  }
}

for (const c of contexts) await c.close().catch(() => {});
await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
