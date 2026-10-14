import test from "node:test";
import assert from "node:assert/strict";
import { orderLabel, readingMinutes, withBase } from "../src/lib/text.js";

test("readingMinutes is at least one and rounds by 220 wpm", () => {
  assert.equal(readingMinutes(""), 1);
  assert.equal(readingMinutes("word ".repeat(220)), 1);
  assert.equal(readingMinutes("word ".repeat(660)), 3);
});

test("withBase joins without doubled or missing slashes", () => {
  assert.equal(withBase("/"), "/");
  assert.equal(withBase("/", "about/"), "/about/");
  assert.equal(withBase("/slop", "/about/"), "/slop/about/");
  assert.equal(withBase("/slop/", "x.svg"), "/slop/x.svg");
});

test("orderLabel pads to two digits", () => {
  assert.equal(orderLabel(1), "01");
  assert.equal(orderLabel(12), "12");
});
