// Renders the poster sequence (lowest 3D tier) and the card still from the same procedural seal
// used by the live 3D page. Output is committed: public/img/seal/seal-NN.webp and seal-poster-800.webp.
// Needs headless Google Chrome (CHROMIUM_PATH overrides) and a built dist/: `npm run build && npm run poster`.
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { serveDist } from "./lib-serve.mjs";

const base = (process.env.SITE_BASE || "/slop-editorial/").replace(/\/?$/, "/");
const out = path.resolve("public/img");
await mkdir(path.join(out, "seal"), { recursive: true });
const { server, url } = await serveDist(path.resolve("dist"), base);
const CHROME = process.env.CHROMIUM_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 640, height: 800 }, deviceScaleFactor: 1 });
await page.goto(`${url}review/poster-stage/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__sealReady === true, null, { timeout: 60000 });
const FRAMES = 18;
for (let i = 0; i < FRAMES; i++) {
  await page.evaluate((a) => window.__sealPose(a), (i / FRAMES) * Math.PI * 2 - 0.35);
  await page.waitForTimeout(300);
  const png = await page.locator("#stage").screenshot({ type: "png" });
  await sharp(png).webp({ quality: 80 }).toFile(path.join(out, "seal", `seal-${String(i).padStart(2, "0")}.webp`));
  if (i === 1) await sharp(png).resize({ width: 800, height: 1000, fit: "cover" }).webp({ quality: 82 }).toFile(path.join(out, "seal-poster-800.webp"));
}
await browser.close();
server.close();
console.log("poster frames written");
