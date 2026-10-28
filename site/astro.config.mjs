import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

// House 2.0.0 (DIRECTION 4.2): the integration marks /house/ external and serves it in dev from HOUSE_DIR.
// HOUSE_DIR is a checkout of the public hub repo. Locally it is the sibling folder, in CI the pinned commit.
const houseDir = path.resolve(process.env.HOUSE_DIR || "../../monsieurgregorio2001-coder.github.io");
const integrationFile = path.join(houseDir, "house", "2.0.0", "tools", "astro-integration.mjs");
if (!existsSync(integrationFile)) throw new Error(`House 2.0.0 not found at ${integrationFile}. Set HOUSE_DIR to a checkout of the hub repo.`);
const { default: house } = await import(pathToFileURL(integrationFile).href);

// Slop Editorial. Static output at the GitHub Pages project path. SITE_BASE and SITE_URL
// can be overridden by the Pages workflow, otherwise the defaults below apply.
const base = (process.env.SITE_BASE || "/slop-editorial/").replace(/\/?$/, "/");

// Stamps the service worker with a build id so a new build replaces the old caches.
const stampServiceWorker = () => ({
  name: "stamp-sw",
  hooks: {
    "astro:build:done": async ({ dir }) => {
      const file = fileURLToPath(new URL("sw.js", dir));
      const src = await readFile(file, "utf8");
      await writeFile(file, src.replaceAll("__BUILD_ID__", Date.now().toString(36)));
    },
  },
});

export default defineConfig({
  site: process.env.SITE_URL || "https://monsieurgregorio2001-coder.github.io",
  base,
  integrations: [house({ houseDir }), mdx(), stampServiceWorker()],
  // Critical CSS is inlined into every HTML response: first paint never waits on a stylesheet.
  build: { inlineStylesheets: "always" },
  devToolbar: { enabled: false },
  // Fetch-ahead is ours (src/scripts/intent.ts): queue, priorities and limits.
  prefetch: false,
});
