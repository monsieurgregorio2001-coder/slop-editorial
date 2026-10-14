// Real-browser verification of the built site (run `npm run build` first).
// Serves dist/ with a tiny static server and drives Chromium through playwright-core.
// Set CHROMIUM_PATH to a Chrome or Chromium binary. Screenshots go to test-output/.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { serveDist } from "./lib-serve.mjs";

const dist = path.resolve("dist");
const base = (process.env.SITE_BASE || "/").replace(/\/?$/, "/");
const exe = process.env.CHROMIUM_PATH;
if (!exe) { console.error("Set CHROMIUM_PATH to a Chrome or Chromium binary."); process.exit(2); }

const { server, origin } = await serveDist(dist, base);

await mkdir("test-output", { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " " + detail : ""}`); };

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(origin);
  check("home has one h1", (await page.locator("h1").count()) === 1);
  check("home lists the sample pieces", (await page.locator("a.row").count()) >= 3);
  await page.screenshot({ path: "test-output/home.png" });

  // Fetch-ahead: hovering a link starts a fetch before the click.
  await page.locator("a.row").first().hover();
  await page.waitForFunction(() => window.__intent && window.__intent.stats.started > 0, null, { timeout: 3000 }).catch(() => {});
  check("hover starts fetch-ahead", await page.evaluate(() => window.__intent?.stats.started > 0));
  check("at most 2 requests in flight", await page.evaluate(() => window.__intent?.stats.maxActive <= 2));

  // Client navigation keeps the shell (no full reload).
  await page.evaluate(() => { window.__marker = "kept"; });
  await page.locator("a.row").first().click();
  await page.waitForURL(/pieces\//);
  check("client navigation keeps page state", (await page.evaluate(() => window.__marker)) === "kept");
  check("piece page shows the sample notice", (await page.locator("[data-sample]").count()) === 1);
  await page.screenshot({ path: "test-output/piece.png" });

  // Reduced motion: honoured from the query string and from the toggle.
  await page.goto(origin + "?motion=reduce");
  check("?motion=reduce sets data-rm", await page.evaluate(() => document.documentElement.hasAttribute("data-rm")));
  check("reduced motion disables transitions", await page.evaluate(() => getComputedStyle(document.querySelector(".row__t")).transitionDuration === "0s"));
  await page.goto(origin + "?motion=auto");
  await page.locator("[data-motion-toggle]").click();
  check("toggle switches to reduced", await page.evaluate(() => document.documentElement.hasAttribute("data-rm")));

  // Phone width: no horizontal scroll.
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const m = await phone.newPage();
  await m.goto(origin);
  check("no horizontal overflow at 375px", await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await m.screenshot({ path: "test-output/phone.png" });

  check("no console or page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nall ${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
