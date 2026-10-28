// Joins the built site to house 2.0.0 (DIRECTION 4.2). Runs after `astro build`.
//   node scripts/house-build.mjs            inject the crumb, footer and boot script, write dist/404.html and the plain-text twins
//   node scripts/house-build.mjs --check    write nothing, exit 1 when any page drifts from the pinned house
// HOUSE_DIR is a checkout of the public hub repo. Locally it defaults to the sibling folder. CI checks out the pinned commit.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { plainTextTwin } from "./lib-plain.mjs";

const check = process.argv.includes("--check");
const dist = path.resolve("dist");
export const houseDir = path.resolve(process.env.HOUSE_DIR || "../../monsieurgregorio2001-coder.github.io");
const tool = path.join(houseDir, "house", "2.0.0", "tools", "house-sync.mjs");
if (!existsSync(tool)) { console.error(`house-build: ${tool} not found. Set HOUSE_DIR to a checkout of the hub repo.`); process.exit(1); }
const sync = (...args) => {
  const r = spawnSync(process.execPath, [tool, ...args], { env: { ...process.env, HOUSE_DIR: houseDir }, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

async function walk(d) {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

if (!check) sync("--404", path.join(dist, "404.html"), "--room", "slop-editorial");
const pages = (await walk(dist)).filter((f) => f.endsWith(".html"));
sync(...(check ? ["--check"] : []), "--room", "slop-editorial", ...pages);
if (!check) {
  let twins = 0;
  for (const f of pages) {
    if (path.basename(f) !== "index.html") continue;
    await writeFile(path.join(path.dirname(f), "index.md"), plainTextTwin(await readFile(f, "utf8")));
    twins++;
  }
  console.log(`house-build: ${pages.length} pages joined to house, ${twins} plain-text twins written`);
}
