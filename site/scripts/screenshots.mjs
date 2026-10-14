// Review screenshots, the README hero, the hub card and the Open Graph image, from headless Google Chrome.
// Usage: npm run build && node scripts/screenshots.mjs [reviewDir]
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { serveDist } from "./lib-serve.mjs";

const base = (process.env.SITE_BASE || "/slop-editorial/").replace(/\/?$/, "/");
const CHROME = process.env.CHROMIUM_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const review = path.resolve(process.argv[2] || path.join(os.homedir(), "Development/portfolio/_review"));
const docs = path.resolve("../docs");
await mkdir(review, { recursive: true });
const { server, url } = await serveDist(path.resolve("dist"), base);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function developedHome(viewport, dsf = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("[data-cookies][data-on]", { timeout: 8000 });
  await page.locator("[data-cookies] [data-accept]").nth(1).click();
  await page.waitForFunction(() => document.querySelector("[data-cover]").hasAttribute("data-sticker") && document.documentElement.dataset.nav === "on", null, { timeout: 9000 });
  await sleep(1500);
  return { ctx, page };
}

{ // Home desktop, and the README hero at 1600 wide
  const { ctx, page } = await developedHome({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(review, "slop3-home-desktop.png") });
  await ctx.close();
  const h = await developedHome({ width: 1600, height: 1000 });
  await h.page.screenshot({ path: path.join(docs, "hero.png") });
  await h.ctx.close();
  const c = await developedHome({ width: 1200, height: 750 });
  const png = await c.page.screenshot();
  await sharp(png).resize(1200, 750).webp({ quality: 84 }).toFile(path.join(review, "slop3-card.webp"));
  await sharp(png).resize(1200, 750).png().toFile(path.join(docs, "card.png"));
  await sharp(png).resize(1200, 750).webp({ quality: 84 }).toFile(path.join(docs, "card.webp"));
  await c.ctx.close();
  const o = await developedHome({ width: 1200, height: 630 });
  const og = await o.page.screenshot();
  await sharp(og).png({ palette: true, quality: 75, compressionLevel: 9, effort: 10 }).toFile(path.resolve("public/og.png"));
  await o.ctx.close();
}
{ // Home mobile
  const { ctx, page } = await developedHome({ width: 390, height: 844 }, 2);
  await page.screenshot({ path: path.join(review, "slop3-home-mobile.png") });
  await ctx.close();
}
{ // Feed desktop
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url + "feed/", { waitUntil: "load" });
  await sleep(1500);
  await page.screenshot({ path: path.join(review, "slop3-feed-desktop.png") });
  await ctx.close();
}
{ // Authenticity desktop: the gold with the gift shop in front of it
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url + "authenticity/?tier=webgl", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-seal]").dataset.tier, null, { timeout: 15000 });
  await page.evaluate(() => { const l = document.querySelector("[data-launch]"); window.scrollTo(0, l.offsetTop + (l.offsetHeight - innerHeight) * 0.9); });
  await sleep(2200);
  await page.screenshot({ path: path.join(review, "slop3-authenticity-desktop.png") });
  await ctx.close();
}
{ // Works desktop
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url + "works/", { waitUntil: "load" });
  await sleep(800);
  await page.screenshot({ path: path.join(review, "slop3-works-desktop.png") });
  await ctx.close();
}
await browser.close();
server.close();
console.log("screenshots written to", review);
