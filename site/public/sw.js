/* Slop Editorial service worker. Cache layers for repeat visits:
   - hashed build assets: cache first, forever
   - images and fonts: stale while revalidate
   - pages: stale while revalidate, so a repeat visit paints from the cache
   The build stamps the id below. A new build installs beside the old one and takes over only
   when every tab of the old one has closed (no skipWaiting), so an open page never loses
   its assets. No third-party requests are ever made or cached. */
const BUILD = "__BUILD_ID__";
const PAGES = `slop-pages-${BUILD}`;
const STATIC = `slop-static-${BUILD}`;
const ROOT = new URL(self.registration.scope).pathname;
const SHELL = ["", "feed/", "authenticity/", "works/"].map((p) => ROOT + p);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(SHELL)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("slop-") && !k.endsWith(BUILD)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function swr(e, req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  const net = fetch(req)
    .then((res) => { if (res.ok) return cache.put(req, res.clone()).then(() => res); return res; })
    .catch(() => hit ?? Response.error());
  e.waitUntil(net);
  return hit ?? net;
}
async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === ROOT + "sw.js") return;
  if (!url.pathname.startsWith(ROOT)) return;
  const rel = url.pathname.slice(ROOT.length);
  // evidence.json is a CI receipt that must always come from the network, never from a cache.
  if (rel === "evidence.json") return;
  if (rel.startsWith("_astro/")) return void e.respondWith(cacheFirst(req));
  if (/^img\//.test(rel) || /\.(woff2|svg)$/.test(rel)) return void e.respondWith(swr(e, req, STATIC));
  const wantsHtml = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (wantsHtml) e.respondWith(swr(e, req, PAGES));
});
