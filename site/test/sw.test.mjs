import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function load() {
  const src = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  let onFetch;
  const self = {
    registration: { scope: "https://x.github.io/slop-editorial/" },
    location: { origin: "https://x.github.io" },
    addEventListener: (t, f) => { if (t === "fetch") onFetch = f; },
  };
  vm.runInNewContext(src, { self, URL, caches: {}, fetch: () => {}, Response: {} });
  return onFetch;
}
function intercepted(onFetch, path, accept = "*/*") {
  let hit = false;
  onFetch({
    request: { method: "GET", url: "https://x.github.io" + path, mode: "cors", headers: { has: () => false, get: () => accept } },
    respondWith: () => { hit = true; },
    waitUntil: () => {},
  });
  return hit;
}

test("service worker never handles evidence.json, even when a page asks for html", async () => {
  const f = await load();
  assert.equal(intercepted(f, "/slop-editorial/evidence.json"), false);
  assert.equal(intercepted(f, "/slop-editorial/evidence.json", "text/html"), false);
});

test("service worker returns early for URLs outside /slop-editorial/", async () => {
  const f = await load();
  assert.equal(intercepted(f, "/other-room/index.html", "text/html"), false);
  assert.equal(intercepted(f, "/", "text/html"), false);
});
