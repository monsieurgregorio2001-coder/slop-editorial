import test from "node:test";
import assert from "node:assert/strict";
import { BUDGETS, pageScripts, staticImports } from "../scripts/lib-budget.mjs";
import { isHouseHref, structureViolations } from "../scripts/lib-gates.mjs";

test("pageScripts counts module scripts and inline scripts, never the house files", () => {
  const html = '<script src="/house/2.0.0/house.js"></script><script type="module" src="/slop-editorial/_astro/a.js"></script><script>var x=1</script>';
  const { srcs, inline } = pageScripts(html);
  assert.deepEqual(srcs, ["/slop-editorial/_astro/a.js"]);
  assert.deepEqual(inline, ["var x=1"]);
});

test("staticImports follows static imports and ignores dynamic ones", () => {
  const code = 'import{a}from"./sys.js";import"./sound.js";const m=()=>import("./lazy.js");';
  assert.deepEqual(staticImports(code), ["./sys.js", "./sound.js"]);
});

test("budgets: home 15 KB, certificate 20 KB", () => {
  assert.equal(BUDGETS.home, 15 * 1024);
  assert.equal(BUDGETS.certificate, 20 * 1024);
});

test("house links are recognised, room links are not", () => {
  for (const h of ["/", "/changelog/", "/colophon/", "/llms.txt", "/index.md", "/paperlab/", "/paluwagan/", "/mindmap-mcp/"]) assert.ok(isHouseHref(h), h);
  assert.ok(!isHouseHref("/slop-editorial/works/"));
  assert.ok(!isHouseHref("/nowhere/"));
});

test("the house skip link satisfies the structure gate", () => {
  const html = '<html lang="en"><meta name="viewport" content="x"><meta name="description" content="d"><a class="house-skip" href="#m">s</a><h1>T</h1>';
  assert.deepEqual(structureViolations(html), []);
});
