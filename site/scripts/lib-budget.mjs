// JavaScript a page loads before any interaction, gzipped: its module scripts, the static imports of those,
// and its inline scripts. House files under /house/ are the house's own budget and are not counted here.
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

export const BUDGETS = { home: 15 * 1024, certificate: 20 * 1024, anyPage: 110 * 1024, imageMax: 250 * 1024 };

/** Script sources and inline script bodies referenced by a page, from its HTML. */
export function pageScripts(html) {
  const srcs = [], inline = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = (m[1].match(/\ssrc="([^"]+)"/) || [])[1];
    if (src) { if (!src.startsWith("/house/")) srcs.push(src); }
    else if (!/type="application\/(ld\+)?json"/i.test(m[1])) inline.push(m[2]);
  }
  return { srcs, inline };
}

/** Static import specifiers of a built module (dynamic import() is lazy and not counted). */
export function staticImports(code) {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s*["'](\.\.?\/[^"']+\.js)["']/g)].map((m) => m[1]);
}

export async function pageJsBytes(html, base, distDir) {
  const { srcs, inline } = pageScripts(html);
  const seen = new Set();
  let total = inline.reduce((n, code) => n + gzipSync(code).length, 0);
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = await readFile(file, "utf8").catch(() => "");
    total += gzipSync(code).length;
    for (const spec of staticImports(code)) await visit(path.resolve(path.dirname(file), spec));
  };
  for (const s of srcs) await visit(path.join(distDir, s.startsWith(base) ? s.slice(base.length) : s.replace(/^\//, "")));
  return total;
}
