/* Slop Editorial service worker. Cache layers for repeat visits:
   - hashed build assets: cache first, forever
   - pages and small static files: stale while revalidate, so a repeat visit paints from cache
   The build stamps the id below. A new build installs beside the old one and takes over only when
   every tab of the old one has closed (no skipWaiting), so an open page never loses its assets.
   Only same-origin requests are ever cached. */
const BUILD = "__BUILD_ID__";
const PAGES = `slop-pages-${BUILD}`;
const STATIC = `slop-static-${BUILD}`;
const ROOT = new URL(self.registration.scope).pathname; // "/" or "/project-name/"

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.add(ROOT)));
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
  e.waitUntil(net); // the revalidation outlives the response
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
  if (url.pathname.startsWith(ROOT + "_astro/")) return void e.respondWith(cacheFirst(req));
  if (/\.(svg|png|webp|jpg|woff2)$/.test(url.pathname)) return void e.respondWith(swr(e, req, STATIC));
  const wantsHtml = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (wantsHtml) e.respondWith(swr(e, req, PAGES));
});
