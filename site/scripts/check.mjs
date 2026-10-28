// Build gate: brand, voice, honesty, structure, leaks, links and performance rules over dist/ and src/.
// Run after `npm run build`. Exits non-zero on a violation.
import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { BUDGETS, pageJsBytes } from "./lib-budget.mjs";
import { brandViolation, hrefToFile, isHouseHref, withoutVerbatim, internalHrefs, leakViolations, longSentences, remoteResources, structureViolations, visibleText, voiceViolations } from "./lib-gates.mjs";

const dist = path.resolve("dist");
const base = (process.env.SITE_BASE || "/slop-editorial/").replace(/\/?$/, "/");
const fails = [];
let passes = 0;
const fail = (m) => { fails.push(m); console.log("FAIL ", m); };
const pass = (m) => { passes++; console.log("PASS ", m); };

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
const workPages = pages.filter((f) => rel(f).startsWith("works" + path.sep) && rel(f) !== path.join("works", "index.html"));
const tool = (f) => rel(f).includes("poster-stage");

// 1. Voice, structure and links for every page.
for (const f of pages) {
  const html = await readFile(f, "utf8");
  const v = voiceViolations(visibleText(withoutVerbatim(html)));
  v.length ? fail(`voice: ${v.join(", ")} in ${rel(f)}`) : pass(`voice: ok in ${rel(f)}`);
  const long = longSentences(withoutVerbatim(html));
  long.length ? fail(`voice: sentence over 25 words (${long[0]}) in ${rel(f)}`) : pass(`voice: sentences short in ${rel(f)}`);
  if (!rel(f).startsWith("404") && !tool(f)) {
    const s = structureViolations(html);
    s.length ? fail(`structure: ${s.join(", ")} in ${rel(f)}`) : pass(`structure: ok in ${rel(f)}`);
  }
  for (const href of internalHrefs(html)) {
    if (isHouseHref(href)) continue;
    const target = hrefToFile(href, base, dist);
    if (target === null) { fail(`links: ${href} escapes the site base in ${rel(f)}`); continue; }
    (await exists(target)) ? null : fail(`links: ${href} does not resolve (from ${rel(f)})`);
  }
}
pass("links: internal link scan complete");

// 2. Honesty: every work page carries the sample notice.
workPages.length >= 6 ? pass(`honesty: ${workPages.length} work pages`) : fail("honesty: expected at least 6 work pages");
for (const f of workPages) (await readFile(f, "utf8")).includes("data-sample") ? pass(`honesty: sample notice in ${rel(f)}`) : fail(`honesty: sample notice missing in ${rel(f)}`);

// 3. Brand tokens, logo, old-brand scan and leaks.
const cssAll = (await Promise.all(files.filter((f) => /\.(css|html)$/.test(f)).map((f) => readFile(f, "utf8")))).join("\n").toLowerCase();
for (const [n, v] of [["ink", "#17171b"], ["paper", "#faf8f4"], ["violet", "#4b2bff"], ["stage", "#0e0b1f"], ["graphite", "#141316"]]) cssAll.includes(v) ? pass(`brand: ${n} ${v} present`) : fail(`brand: ${n} ${v} missing`);
for (const name of ["logo.svg", "wordmark.svg", "favicon.svg"]) files.some((f) => f.endsWith(name)) ? pass(`brand: ${name} shipped`) : fail(`brand: ${name} missing`);
const textFiles = files.filter((x) => /\.(html|js|css|json|svg|txt|webmanifest)$/.test(x));
const srcFiles = (await walk(path.resolve("src"))).concat((await walk(path.resolve("scripts"))), (await walk(path.resolve("test")))).filter((f) => /\.(astro|ts|js|mjs|mdx|css|py)$/.test(f));
let brandHits = 0;
for (const f of [...textFiles, ...srcFiles]) {
  if (f.endsWith("OFL.txt")) continue;
  const b = brandViolation(await readFile(f, "utf8"));
  if (b) { brandHits++; fail(`brand: banned word "${b}" in ${path.relative(process.cwd(), f)}`); }
}
brandHits === 0 ? pass(`brand: no old-brand or banned subject words in ${textFiles.length + srcFiles.length} files`) : null;
for (const f of textFiles) {
  const l = leakViolations(await readFile(f, "utf8"));
  if (l.length) fail(`leaks: ${l.join(", ")} in ${rel(f)}`);
}
pass("leaks: scan complete");

// 3b. Source voice: no em dash anywhere in source or content, no contractions in string copy.
let srcHits = 0;
for (const f of srcFiles) {
  const t = await readFile(f, "utf8");
  if (t.includes("\u2014")) { srcHits++; fail(`voice: em dash in ${path.relative(process.cwd(), f)}`); }
  if (/\.(ts|astro|mdx)$/.test(f) && /["'`][^"'`\n]*\b\w+n't\b[^"'`\n]*["'`]/.test(t.replace(/\/\/.*$/gm, ""))) { srcHits++; fail(`voice: contraction in string in ${path.relative(process.cwd(), f)}`); }
}
srcHits === 0 ? pass("voice: source has no em dashes or contractions in copy") : null;

// 4. Performance budgets (gzip) and HTML-first rules.
const js = files.filter((f) => f.endsWith(".js") && f.includes("_astro"));
const kb = (n) => (n / 1024).toFixed(1);
let worst = 0, worstPage = "";
for (const f of pages) {
  const bytes = await pageJsBytes(await readFile(f, "utf8"), base, dist);
  if (bytes > worst) { worst = bytes; worstPage = rel(f); }
  if (rel(f) === "index.html") bytes <= BUDGETS.home ? pass(`perf: home JS ${kb(bytes)} KB gz (budget ${kb(BUDGETS.home)})`) : fail(`perf: home JS ${kb(bytes)} KB gz over ${kb(BUDGETS.home)}`);
  if (rel(f) === path.join("authenticity", "index.html")) bytes <= BUDGETS.certificate ? pass(`perf: certificate JS ${kb(bytes)} KB gz (budget ${kb(BUDGETS.certificate)})`) : fail(`perf: certificate JS ${kb(bytes)} KB gz over ${kb(BUDGETS.certificate)}`);
}
worst <= BUDGETS.anyPage ? pass(`perf: heaviest page JS ${kb(worst)} KB gz in ${worstPage} (budget ${kb(BUDGETS.anyPage)})`) : fail(`perf: ${worstPage} JS ${kb(worst)} KB gz over ${kb(BUDGETS.anyPage)}`);
// The certificate page ships a photograph and CSS, not a 3D library.
js.some((f) => /three|WebGLRenderer|WebGPURenderer/.test(path.basename(f))) ? fail("perf: a 3D library chunk is still in the build") : pass("perf: no 3D library chunk in the build");
let imgMax = 0;
for (const f of files.filter((x) => /\.(webp|png|jpg|svg)$/.test(x))) imgMax = Math.max(imgMax, (await stat(f)).size);
imgMax <= BUDGETS.imageMax ? pass(`perf: largest image ${kb(imgMax)} KB`) : fail(`perf: largest image ${kb(imgMax)} KB over 250`);
for (const f of pages) {
  const html = await readFile(f, "utf8");
  /<link[^>]+rel="stylesheet"[^>]+href="(?!\/house\/2\.0\.1\/)/.test(html) ? fail(`speed: render-blocking stylesheet in ${rel(f)}`) : pass(`speed: critical CSS inline in ${rel(f)}`);
  const remote = remoteResources(html);
  remote.length ? fail(`external: request to ${remote[0]} in ${rel(f)}`) : pass(`external: no third-party hosts in ${rel(f)}`);
}
for (const f of files.filter((x) => /\.(css|js)$/.test(x))) {
  const t = await readFile(f, "utf8");
  /url\(\s*["']?https?:|@import\s+(url\()?["']?https?:/.test(t) ? fail(`external: remote url() or @import in ${rel(f)}`) : null;
}
pass("external: no remote url() or @import in CSS or JS");
files.filter((f) => f.endsWith(".woff2")).length >= 3 ? pass("brand: fonts self-hosted (woff2 shipped)") : fail("brand: expected self-hosted woff2 fonts");
files.some((f) => f.endsWith("OFL.txt")) ? pass("brand: font license shipped") : fail("brand: OFL.txt missing");
/fonts\.(googleapis|gstatic)\.com/.test(cssAll) ? fail("brand: Google Fonts request found") : pass("brand: no Google Fonts request");
const sw = await readFile(path.join(dist, "sw.js"), "utf8").catch(() => "");
sw && !sw.includes("__BUILD_ID__") ? pass("speed: service worker present and build-stamped") : fail("speed: service worker missing or unstamped");
files.some((f) => f.endsWith("_headers")) ? pass("speed: cache policy file shipped") : fail("speed: _headers missing");
/prefers-reduced-motion/.test(cssAll) && /data-rm/.test(cssAll) ? pass("a11y: reduced-motion rules present") : fail("a11y: reduced-motion rules missing");

// 5. House laws: no custom cursor, no scroll hijack, no scroll snapping.
const all = cssAll + (await Promise.all(js.map((f) => readFile(f, "utf8")))).join("\n");
/cursor:\s*url\(/.test(all) ? fail("law: custom cursor image found") : pass("law: no custom cursor");
/addEventListener\(\s*["']wheel["']/.test(all) ? fail("law: wheel listener found (scroll hijack risk)") : pass("law: no wheel listeners");
/scroll-snap-type/.test(all) ? fail("law: scroll snapping found") : pass("law: no scroll snapping");

console.log(fails.length ? `\n${fails.length} violation(s), ${passes} passed` : `\nall gates passed (${passes} checks)`);
process.exit(fails.length ? 1 : 0);
