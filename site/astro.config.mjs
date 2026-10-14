import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Slop Editorial sample site. Static output. SITE_URL and SITE_BASE are set by the
// Pages workflow so the same build works at a project path such as /slop-editorial/.
const base = process.env.SITE_BASE || "/";

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
  site: process.env.SITE_URL || undefined,
  base,
  integrations: [mdx(), stampServiceWorker()],
  // Critical CSS is inlined into every HTML response: first paint never waits on a stylesheet.
  build: { inlineStylesheets: "always" },
  devToolbar: { enabled: false },
  // Fetch-ahead is ours (src/scripts/intent.ts): queue, priorities and limits.
  prefetch: false,
});
