import test from "node:test";
import assert from "node:assert/strict";
import { money, orderLabel, rankFor, stagedAverage, withBase } from "../src/lib/text.js";

test("withBase joins without doubled or missing slashes", () => {
  assert.equal(withBase("/"), "/");
  assert.equal(withBase("/", "feed/"), "/feed/");
  assert.equal(withBase("/slop-editorial", "/feed/"), "/slop-editorial/feed/");
  assert.equal(withBase("/slop-editorial/", "x.svg"), "/slop-editorial/x.svg");
});

test("orderLabel pads to two digits", () => {
  assert.equal(orderLabel(1), "01");
  assert.equal(orderLabel(12), "12");
});

test("rank starts at 184 and only improves with score", () => {
  assert.equal(rankFor(1, 0), 184);
  assert.equal(rankFor(1, 10), 183);
  assert.equal(rankFor(1, 100), 174);
  assert.ok(rankFor(1, 400) < rankFor(1, 40));
  assert.equal(rankFor(1, 5000), 1);
});

test("the staged rating average is always 4.2", () => {
  for (const stars of [1, 2, 3, 4, 5]) assert.equal(stagedAverage(stars), "4.2");
});

test("money rounds to two decimals", () => {
  assert.equal(money(14.99 * 3 + 2), "46.97");
  assert.equal(money(0), "0.00");
});
