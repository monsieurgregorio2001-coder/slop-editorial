// Build gate: voice, honesty, structure, leaks, links and performance rules over dist/.
// Run after `npm run build`. Exits non-zero on a violation.
import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { hrefToFile, internalHrefs, leakViolations, longSentences, remoteResources, structureViolations, visibleText, voiceViolations } from "./lib-gates.mjs";

const dist = path.resolve("dist");
const base = (process.env.SITE_BASE || "/").replace(/\/?$/, "/");
const fails = [];
const fail = (m) => { fails.push(m); console.log("FAIL ", m); };
const pass = (m) => console.log("PASS ", m);

async function walk(d) {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p))); else out.push(p);
  }
  return out;
}
const exists = (f) => stat(f).then(() => true, () => false);
const files = await walk(dist);
const rel = (f) => path.relative(dist, f);
const pages = files.filter((f) => f.endsWith(".html"));
const piecePages = pages.filter((f) => rel(f).startsWith("pieces" + path.sep));

// 1. Voice, structure and links for every page.
for (const f of pages) {
  const html = await readFile(f, "utf8");
  const v = voiceViolations(visibleText(html));
  v.length ? fail(`voice: ${v.join(", ")} in ${rel(f)}`) : pass(`voice: ok in ${rel(f)}`);
  const long = longSentences(html);
  long.length ? fail(`voice: sentence over 25 words (${long[0]}) in ${rel(f)}`) : pass(`voice: sentences short in ${rel(f)}`);
  if (!rel(f).startsWith("404")) {
    const s = structureViolations(html);
    s.length ? fail(`structure: ${s.join(", ")} in ${rel(f)}`) : pass(`structure: ok in ${rel(f)}`);
  }
  for (const href of internalHrefs(html)) {
    const target = hrefToFile(href, base, dist);
    if (target === null) { fail(`links: ${href} escapes the site base in ${rel(f)}`); continue; }
    (await exists(target)) ? null : fail(`links: ${href} does not resolve (from ${rel(f)})`);
  }
}
pass("links: internal link scan complete");

// 2. Honesty: every piece carries the sample notice. The site has at least one piece.
piecePages.length >= 3 ? pass(`honesty: ${piecePages.length} piece pages`) : fail("honesty: expected at least 3 piece pages");
for (const f of piecePages) (await readFile(f, "utf8")).includes("data-sample") ? pass(`honesty: sample notice in ${rel(f)}`) : fail(`honesty: sample notice missing in ${rel(f)}`);

// 3. Brand tokens, logo and no leaks.
const cssAll = (await Promise.all(files.filter((f) => /\.(css|html)$/.test(f)).map((f) => readFile(f, "utf8")))).join("\n").toLowerCase();
for (const [n, v] of [["ink", "#17171b"], ["paper", "#faf8f4"], ["accent", "#2340b8"], ["dark paper", "#0f0f12"]]) cssAll.includes(v) ? pass(`brand: ${n} ${v} present`) : fail(`brand: ${n} ${v} missing`);
files.some((f) => f.endsWith("logo.svg")) ? pass("brand: logo shipped") : fail("brand: logo missing");
for (const f of files.filter((x) => /\.(html|js|css|json|svg|txt)$/.test(x))) {
  const l = leakViolations(await readFile(f, "utf8"));
  if (l.length) fail(`leaks: ${l.join(", ")} in ${rel(f)}`);
}
pass("leaks: scan complete");

// 4. Performance budgets (gzip) and HTML-first rules.
const js = files.filter((f) => f.endsWith(".js") && f.includes("_astro"));
let jsBytes = 0;
for (const f of js) jsBytes += gzipSync(await readFile(f)).length;
const kb = (n) => (n / 1024).toFixed(1);
jsBytes <= 40 * 1024 ? pass(`perf: JS ${kb(jsBytes)} KB gz (budget 40)`) : fail(`perf: JS ${kb(jsBytes)} KB gz over 40`);
let imgMax = 0;
for (const f of files.filter((x) => /\.(webp|png|jpg|svg)$/.test(x))) imgMax = Math.max(imgMax, (await stat(f)).size);
imgMax <= 250 * 1024 ? pass(`perf: largest image ${kb(imgMax)} KB`) : fail(`perf: largest image ${kb(imgMax)} KB over 250`);
for (const f of pages) {
  const html = await readFile(f, "utf8");
  /<link[^>]+rel="stylesheet"/.test(html) ? fail(`speed: render-blocking stylesheet in ${rel(f)}`) : pass(`speed: critical CSS inline in ${rel(f)}`);
  const remote = remoteResources(html);
  remote.length ? fail(`speed: third-party request ${remote[0]} in ${rel(f)}`) : pass(`speed: no third-party hosts in ${rel(f)}`);
}
files.filter((f) => f.endsWith(".woff2")).length >= 3 ? pass("brand: fonts self-hosted (woff2 shipped)") : fail("brand: expected self-hosted woff2 fonts");
/fonts\.(googleapis|gstatic)\.com/.test(cssAll) ? fail("brand: Google Fonts request found") : pass("brand: no Google Fonts request");
const sw = await readFile(path.join(dist, "sw.js"), "utf8").catch(() => "");
sw && !sw.includes("__BUILD_ID__") ? pass("speed: service worker present and build-stamped") : fail("speed: service worker missing or unstamped");
files.some((f) => f.endsWith("_headers")) ? pass("speed: cache policy file shipped") : fail("speed: _headers missing");

// 5. House laws: no custom cursor, no scroll hijack, no scroll snapping.
const all = cssAll + (await Promise.all(js.map((f) => readFile(f, "utf8")))).join("\n");
/cursor:\s*url\(/.test(all) ? fail("law: custom cursor image found") : pass("law: no custom cursor");
/addEventListener\(\s*["']wheel["']/.test(all) ? fail("law: wheel listener found (scroll hijack risk)") : pass("law: no wheel listeners");
/scroll-snap-type/.test(all) ? fail("law: scroll snapping found") : pass("law: no scroll snapping");

console.log(fails.length ? `\n${fails.length} violation(s)` : "\nall gates passed");
process.exit(fails.length ? 1 : 0);
