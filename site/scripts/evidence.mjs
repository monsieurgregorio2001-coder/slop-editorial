// Writes dist/evidence.json (DIRECTION 4.4, schema 1) from the logs of real runs.
// Every count is parsed from a captured log; nothing is typed here. Any missing or
// failing suite exits non-zero, so CI fails instead of publishing a doubtful receipt.
// Usage: node scripts/evidence.mjs --unit f --pipeline f --check f --verify f [--out dist/evidence.json]
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { BUDGETS, pageJsBytes } from "./lib-budget.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
for (const k of ["unit", "pipeline", "check", "verify"]) if (!args[k]) { console.error(`missing --${k} <log file>`); process.exit(2); }
const dist = args.dist ?? "dist";
const out = args.out ?? join(dist, "evidence.json");
const problems = [];
const read = (f) => readFile(f, "utf8");
const num = (m) => (m ? Number(m[1]) : null);

function suite(id, label, command, passed, total) {
  if (passed == null || total == null || total <= 0) problems.push(`${id}: could not parse counts from the log`);
  else if (passed !== total) problems.push(`${id}: ${passed} of ${total} passed`);
  return { id, label, passed, total, command };
}

const unitLog = await read(args.unit);
const unit = suite("unit", "Site unit tests", "npm test", num(unitLog.match(/^# pass (\d+)/m)), num(unitLog.match(/^# tests (\d+)/m)));

const pyLog = await read(args.pipeline);
const ran = num(pyLog.match(/^Ran (\d+) tests?/m));
const bad = (num(pyLog.match(/failures=(\d+)/)) ?? 0) + (num(pyLog.match(/errors=(\d+)/)) ?? 0);
const pyOk = /^OK/m.test(pyLog);
const pipeline = suite("pipeline", "Pipeline Python tests", "python -m unittest discover -s tests -t .", ran == null ? null : pyOk ? ran : ran - bad, ran);

const checkLog = await read(args.check);
const allPassed = num(checkLog.match(/all gates passed \((\d+) checks\)/));
const viol = checkLog.match(/(\d+) violation\(s\), (\d+) passed/);
const gates = allPassed != null ? suite("gates", "Build gates", "npm run check", allPassed, allPassed)
  : viol ? suite("gates", "Build gates", "npm run check", Number(viol[2]), Number(viol[1]) + Number(viol[2]))
  : suite("gates", "Build gates", "npm run check", null, null);

const verifyLog = await read(args.verify);
const vm = verifyLog.match(/^(\d+) passed, (\d+) failed/m);
const browser = suite("browser", "Real-browser checks (Chromium)", "npm run verify", vm ? Number(vm[1]) : null, vm ? Number(vm[1]) + Number(vm[2]) : null);

// Figures: same measurement rule as scripts/check.mjs, computed from the built site.
async function walk(d) {
  const r = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    r.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return r;
}
const files = await walk(dist);
const base = (process.env.SITE_BASE || "/slop-editorial/").replace(/\/?$/, "/");
const pageJs = async (rel) => pageJsBytes(await read(join(dist, rel)), base, dist);
const homeJs = await pageJs("index.html");
const certificateJs = await pageJs("authenticity/index.html");
let imgMax = 0;
for (const f of files.filter((x) => /\.(webp|png|jpg|svg)$/.test(x))) imgMax = Math.max(imgMax, (await stat(f)).size);

const sh = (c) => execSync(c, { encoding: "utf8" }).trim();
const commit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : sh("git rev-parse --short HEAD");
const runner = process.env.GITHUB_ACTIONS
  ? `GitHub Actions ${process.env.ImageOS ?? "ubuntu"}, Node ${process.versions.node.split(".")[0]}`
  : `local run, Node ${process.versions.node.split(".")[0]}`;

const evidence = {
  schema: 1,
  room: "slop-editorial",
  commit,
  ran_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  runner,
  tests: [unit, pipeline, gates, browser],
  evals: [],
  figures: [
    { id: "js-home-gz", value: homeJs, unit: "bytes", label: "JavaScript on the home page, gzipped", source: "site/scripts/lib-budget.mjs" },
    { id: "js-certificate-gz", value: certificateJs, unit: "bytes", label: "JavaScript on the certificate page, gzipped", source: "site/scripts/lib-budget.mjs" },
  ],
  budgets: [
    { id: "js-home-gz", limit: BUDGETS.home, actual: homeJs },
    { id: "js-certificate-gz", limit: BUDGETS.certificate, actual: certificateJs },
    { id: "image-max", limit: BUDGETS.imageMax, actual: imgMax },
  ],
  limits: [
    "Paid providers were tested against fakes only.",
    "The current nine plates have no generation record.",
  ],
};
for (const b of evidence.budgets) if (b.actual > b.limit) problems.push(`budget ${b.id}: ${b.actual} over ${b.limit}`);

if (problems.length) { console.error("evidence: refusing to write\n  " + problems.join("\n  ")); process.exit(1); }
await writeFile(out, JSON.stringify(evidence, null, 2) + "\n");
console.log(`evidence: wrote ${out}`);
