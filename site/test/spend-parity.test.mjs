import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluate, plannedTotal, compute, MSG_CAP_INVALID, money, round4 } from "../src/lib/spend.ts";

const fixtures = JSON.parse(await readFile(new URL("./fixtures/spend-parity.json", import.meta.url), "utf8"));
const prices = JSON.parse(await readFile(new URL("../src/data/spend-prices.json", import.meta.url), "utf8"));
const capOf = (c) => (c === "nan" ? NaN : c === "inf" ? Infinity : c);

test("Python and TypeScript agree on every parity fixture", () => {
  assert.ok(fixtures.rows.length > 1000, "fixtures were generated");
  let bad = 0;
  for (const r of fixtures.rows) {
    const total = plannedTotal(r.per_image, r.jobs);
    const v = evaluate(total, capOf(r.cap), r.provider, r.free);
    const same = total === r.total && v.refused === r.refused && v.message === r.message && JSON.stringify(v.requirements) === JSON.stringify(r.requirements);
    if (!same && bad++ < 3) console.log("DIFF", JSON.stringify(r), JSON.stringify({ total, v }));
  }
  assert.equal(bad, 0);
});

test("the price table the page ships is the one the fixtures were built from", () => {
  const seen = new Map(fixtures.rows.filter((r) => r.width === prices.width && r.height === prices.height).map((r) => [`${r.provider}|${r.model}`, r.per_image]));
  assert.equal(seen.size, prices.rows.length);
  for (const row of prices.rows) assert.equal(seen.get(`${row.provider}|${row.model}`), row.usd, row.model);
});

test("exact ties round to even, as Python does", () => {
  assert.equal(money(0.125), "0.12");
  assert.equal(money(0.375), "0.38");
  assert.equal(money(2.5), "2.50");
  assert.equal(round4(0.03125), 0.0312);
});

test("compute refuses with the CLI's exact string, values substituted", () => {
  const r = compute({ plates: "9", rerolls: "1", model: "fal|fal-ai/flux/dev", cap: "0.5" }, prices.rows);
  assert.equal(r.kind, "ok");
  assert.equal(r.jobs, 18);
  assert.equal(r.verdict.refused, true);
  assert.equal(r.verdict.message, `estimated $0.71 exceeds --max-usd 0.50; raise the cap or narrow with --only`);
});

test("compute under the cap shows the CLI's approval requirement", () => {
  const r = compute({ plates: "2", rerolls: "0", model: "fal|fal-ai/flux/dev", cap: "5" }, prices.rows);
  assert.equal(r.verdict.refused, false);
  assert.deepEqual(r.verdict.requirements, ["estimated spend $0.08 on fal; rerun with --yes to proceed", "paid runs need --approval-ref naming the recorded human approval"]);
});

test("compute: bad input is asked for again, a negative cap gets the CLI's words", () => {
  const base = { plates: "9", rerolls: "1", model: "fal|fal-ai/flux/dev", cap: "1" };
  assert.equal(compute({ ...base, plates: "" }, prices.rows).field, "plates");
  assert.equal(compute({ ...base, plates: "0" }, prices.rows).field, "plates");
  assert.equal(compute({ ...base, rerolls: "x" }, prices.rows).field, "rerolls");
  assert.equal(compute({ ...base, cap: "" }, prices.rows).field, "cap");
  const neg = compute({ ...base, cap: "-1" }, prices.rows);
  assert.equal(neg.verdict.message, MSG_CAP_INVALID);
  assert.equal(compute({ ...base, cap: "abc" }, prices.rows).text, MSG_CAP_INVALID);
});

test("the free mock provider has no cap and no approval", () => {
  const r = compute({ plates: "9", rerolls: "3", model: "mock|mock-t2i", cap: "0" }, prices.rows);
  assert.equal(r.total, 0);
  assert.equal(r.verdict.refused, false);
  assert.deepEqual(r.verdict.requirements, []);
});
