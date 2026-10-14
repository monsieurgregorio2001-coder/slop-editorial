// Pure gate logic, shared by check.mjs and unit tested in test/gates.test.mjs.
import path from "node:path";

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&mdash;": "\u2014", "&#8212;": "\u2014", "&nbsp;": " " };

/** Text a reader sees: scripts, styles, comments and tags removed, entities decoded. */
export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|nbsp|mdash|#39|#x27|#8212);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, " ")
    .trim();
}

const CONTRACTION = /\b(?:\w+n['’]t|\w+['’](?:re|ve|ll|d|m)|(?:it|that|there|here|what|who|he|she|let)['’]s)\b/i;

/** House voice: no em dashes, no semicolons, no contractions. Returns a list of problems. */
export function voiceViolations(text) {
  const out = [];
  if (text.includes("\u2014")) out.push("em dash");
  if (text.includes(";")) out.push("semicolon");
  const c = text.match(CONTRACTION);
  if (c) out.push(`contraction "${c[0]}"`);
  return out;
}

// Words that must never appear in shipped output or source. Built from fragments so this file
// stays clean under the same search. Case-insensitive.
const BANNED = [
  ["vul", "gar"], ["vl", "gr"], ["a51", "025"], ["ant", "on"], ["insta", "gram"], ["je", "sus"], ["rel", "ic"], ["ga", "ze"],
].map((parts) => parts.join(""));
const BANNED_RE = new RegExp(`\\b(?:${BANNED.join("|")})\\b|\\bDE` + `C-\\d`, "i");

/** Brand hygiene: the old brand and subject words must not appear anywhere. Returns the first match or null. */
export function brandViolation(text) {
  const m = text.match(BANNED_RE);
  return m ? m[0] : null;
}

const SECRET = /(api[_-]?key|secret|password|bearer\s+[a-z0-9]{12,}|sk-[a-z0-9]{16,}|ghp_[a-z0-9]{20,}|akia[0-9a-z]{12,}|xox[bap]-)/i;
const ABS_PATH = /(\/Users\/|\/home\/[a-z]|[A-Z]:\\Users\\)/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// The one public contact address shown in the shared footer. Any other address is a leak.
export const PUBLIC_CONTACT = "lim.ggreg@outlook.com";

/** Credential-shaped text, personal absolute paths and email addresses in built output. */
export function leakViolations(text) {
  const out = [];
  if (SECRET.test(text)) out.push("credential-shaped text");
  if (ABS_PATH.test(text)) out.push("absolute path");
  if (EMAIL.test(text.split(PUBLIC_CONTACT).join(""))) out.push("email address");
  return out;
}

/** Basic page structure checks. */
export function structureViolations(html) {
  const out = [];
  if (!/<html[^>]+lang="[a-z-]+"/i.test(html)) out.push("missing html lang");
  if (!/<meta[^>]+name="viewport"/i.test(html)) out.push("missing viewport meta");
  if (!/<meta[^>]+name="description"[^>]+content="[^"]+"/i.test(html)) out.push("missing description");
  const h1 = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1 !== 1) out.push(`expected one h1, found ${h1}`);
  for (const img of html.match(/<img\b[^>]*>/gi) || []) if (!/\balt=/.test(img)) out.push("img without alt");
  if (!/class="skip/.test(html)) out.push("missing skip link");
  return out;
}

/** Internal hrefs in a page, without fragments and queries. External and special schemes are skipped. */
export function internalHrefs(html) {
  const hrefs = [];
  for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]*)"/gi)) {
    const h = m[1].split("#")[0].split("?")[0];
    if (!h || /^(https?:|mailto:|tel:|javascript:)/i.test(h)) continue;
    hrefs.push(h);
  }
  return hrefs;
}

/** Map an href to the file the static host would serve. `base` is "/" or "/name/". */
export function hrefToFile(href, base, distDir) {
  let p = href;
  if (p.startsWith(base)) p = p.slice(base.length);
  else if (p.startsWith("/")) return null; // outside this site's base
  p = p.replace(/^\/+/, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  else if (!path.extname(p)) p += "/index.html";
  return path.join(distDir, p);
}

const MAX_WORDS = 25;

/** Text of paragraph-like blocks (p, dd, li), one string per block. */
export function proseBlocks(html) {
  const blocks = [];
  // Innermost blocks only: a list item that wraps other blocks is a layout container, not a sentence.
  for (const m of html.matchAll(/<(p|dd|li)\b[^>]*>((?:(?!<(?:p|dd|li|div|dl|ul|ol|article|section|figure)\b)[\s\S])*?)<\/\1>/gi)) blocks.push(visibleText(m[2]));
  return blocks;
}

/** Sentences over 25 words in prose blocks. Returns the first words of each offender. */
export function longSentences(html) {
  const out = [];
  for (const block of proseBlocks(html)) {
    for (const s of block.split(/(?<=[.!?])\s+/)) {
      const words = s.split(/\s+/).filter(Boolean);
      if (words.length > MAX_WORDS) out.push(words.slice(0, 6).join(" ") + "...");
    }
  }
  return out;
}

/** Remote resources a page would load: external src on any tag, or an external link or preload href. */
export function remoteResources(html) {
  const out = [];
  for (const m of html.matchAll(/<(script|img|source|iframe|video|audio)\b[^>]*\ssrc="(https?:\/\/[^"]+)"/gi)) out.push(m[2]);
  for (const m of html.matchAll(/<link\b[^>]*\shref="(https?:\/\/[^"]+)"/gi)) out.push(m[1]);
  return out;
}
