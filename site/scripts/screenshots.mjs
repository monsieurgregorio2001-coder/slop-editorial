// Captures real screenshots of the built site with headless Chrome (run `npm run build` first).
// Usage: CHROMIUM_PATH=/path/to/chrome node scripts/screenshots.mjs <output-dir>
// Writes og.png (1200x630), card.png (1200x750), hero.png (1600 wide),
// desktop-light.png (1280x800) and mobile-light.png (360 wide), all in the light theme.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { serveDist } from "./lib-serve.mjs";

const exe = process.env.CHROMIUM_PATH;
const outDir = path.resolve(process.argv[2] || "test-output");
if (!exe) { console.error("Set CHROMIUM_PATH to a Chrome or Chromium binary."); process.exit(2); }
const base = (process.env.SITE_BASE || "/").replace(/\/?$/, "/");
const { server, origin } = await serveDist(path.resolve("dist"), base);
await mkdir(outDir, { recursive: true });

const shots = [
  ["og.png", { width: 1200, height: 630 }, 1],
  ["card.png", { width: 1200, height: 750 }, 1],
  ["hero.png", { width: 1600, height: 1000 }, 1],
  ["desktop-light.png", { width: 1280, height: 800 }, 1],
  ["mobile-light.png", { width: 360, height: 740 }, 2],
];
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  for (const [name, viewport, scale] of shots) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: "light", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, name) });
    console.log("wrote", path.join(outDir, name));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
