import test from "node:test";
import assert from "node:assert/strict";
import { testsHtml, evalsHtml, budgetsHtml, limitsHtml, runHtml, MISSING } from "../src/lib/receipt.ts";

const e = {
  commit: "abc1234", ran_at: "2026-10-28T12:00:00Z", runner: "local run, Node 22",
  tests: [{ id: "unit", label: "Site unit tests", passed: 3, total: 3, command: "npm test" }],
  evals: [],
  budgets: [{ id: "js-home-gz", limit: 15360, actual: 10240 }],
  limits: ["Paid providers were tested against fakes only.", "The current nine plates have no generation record."],
};

test("without evidence every slot says not measured yet", () => {
  for (const f of [testsHtml, evalsHtml, budgetsHtml, limitsHtml, runHtml]) assert.equal(f(null), MISSING);
  assert.equal(evalsHtml({}), MISSING);
});

test("slots print what the evidence file holds", () => {
  assert.match(testsHtml(e), /3 of 3/);
  assert.match(budgetsHtml(e), /10\.0 KB<\/span> of 15\.0 KB/);
  assert.match(evalsHtml(e), /^None\./);
  assert.match(limitsHtml(e), /Paid providers were tested against fakes only\./);
  assert.match(limitsHtml(e), /The current nine plates have no generation record\./);
  assert.match(runHtml(e), /abc1234/);
});
