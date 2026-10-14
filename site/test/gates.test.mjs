import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_CONTACT, hrefToFile, internalHrefs, leakViolations, longSentences, remoteResources, structureViolations, visibleText, voiceViolations } from "../scripts/lib-gates.mjs";

test("visibleText drops scripts, styles, comments and decodes entities", () => {
  const html = "<style>a{}</style><p>Tom &amp; Jo</p><!-- hidden --><script>var x = 1;</script>";
  assert.equal(visibleText(html), "Tom & Jo");
});

test("voice gate flags em dash, semicolon and contractions", () => {
  assert.deepEqual(voiceViolations("A plain sentence, with a colon: fine."), []);
  assert.ok(voiceViolations("One — two").includes("em dash"));
  assert.ok(voiceViolations("One; two").includes("semicolon"));
  for (const bad of ["it's", "don't", "we’re", "they'll", "I'm", "let's"]) {
    assert.ok(voiceViolations(`say ${bad} here`).some((v) => v.startsWith("contraction")), bad);
  }
});

test("voice gate allows possessives", () => {
  assert.deepEqual(voiceViolations("The editor's desk and the studio's rules."), []);
});

test("leak gate flags credentials, personal paths and emails", () => {
  assert.deepEqual(leakViolations("Nothing to see here."), []);
  assert.ok(leakViolations("Bear" + "er abcdefghijklmnop").includes("credential-shaped text"));
  assert.ok(leakViolations("see " + "/Users" + "/someone/file").includes("absolute path"));
  assert.ok(leakViolations("write to a@b.org").includes("email address"));
});

test("structure gate", () => {
  const good = '<html lang="en"><meta name="viewport" content="x"><meta name="description" content="d"><a class="skip" href="#m">s</a><h1>T</h1><img alt="" src="a.png">';
  assert.deepEqual(structureViolations(good), []);
  assert.ok(structureViolations(good.replace(' lang="en"', "")).includes("missing html lang"));
  assert.ok(structureViolations(good + "<h1>Two</h1>").some((v) => v.includes("one h1")));
  assert.ok(structureViolations(good + '<img src="b.png">').includes("img without alt"));
});

test("internalHrefs skips external, mail and fragment-only links", () => {
  const html = '<a href="/a/">a</a><a href="https://x.org">x</a><a href="mailto:a@b.c">m</a><a href="#top">t</a><a href="/b/?q=1#z">b</a>';
  assert.deepEqual(internalHrefs(html), ["/a/", "/b/"]);
});

test("hrefToFile maps links to served files and respects the base", () => {
  assert.equal(hrefToFile("/", "/", "/d"), "/d/index.html");
  assert.equal(hrefToFile("/about/", "/", "/d"), "/d/about/index.html");
  assert.equal(hrefToFile("/slop/about/", "/slop/", "/d"), "/d/about/index.html");
  assert.equal(hrefToFile("/slop/favicon.svg", "/slop/", "/d"), "/d/favicon.svg");
  assert.equal(hrefToFile("/elsewhere/", "/slop/", "/d"), null);
});

test("public contact address is allowed, others are not", () => {
  assert.deepEqual(leakViolations(`mail ${PUBLIC_CONTACT} today`), []);
  assert.ok(leakViolations(`mail ${PUBLIC_CONTACT} and x@y.org`).includes("email address"));
});

test("longSentences flags prose over 25 words only", () => {
  const ok = "<p>Short one. Another short one.</p>";
  const bad = `<p>${"word ".repeat(26).trim()}.</p>`;
  assert.deepEqual(longSentences(ok), []);
  assert.equal(longSentences(bad).length, 1);
  assert.deepEqual(longSentences("<h1>" + "word ".repeat(40) + "</h1>"), []);
});

test("remoteResources finds external loads but not plain links", () => {
  const html = '<a href="https://example.org/">x</a><link rel="stylesheet" href="https://fonts.example/a.css"><script src="https://cdn.example/a.js"></script><img src="/a.png">';
  assert.deepEqual(remoteResources(html), ["https://cdn.example/a.js", "https://fonts.example/a.css"]);
});
