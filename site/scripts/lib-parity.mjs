// Replays the Python-generated spend fixtures through the TypeScript port. Used by evidence.mjs for the parity row.
// Run through `node --experimental-strip-types` so the .ts port loads as it is.
import { readFile } from "node:fs/promises";
import { evaluate, plannedTotal } from "../src/lib/spend.ts";

const capOf = (c) => (c === "nan" ? NaN : c === "inf" ? Infinity : c);

export async function parity() {
  const { rows } = JSON.parse(await readFile(new URL("../test/fixtures/spend-parity.json", import.meta.url), "utf8"));
  let passed = 0;
  for (const r of rows) {
    const total = plannedTotal(r.per_image, r.jobs);
    const v = evaluate(total, capOf(r.cap), r.provider, r.free);
    if (total === r.total && v.refused === r.refused && v.message === r.message && JSON.stringify(v.requirements) === JSON.stringify(r.requirements)) passed++;
  }
  return { passed, total: rows.length };
}
