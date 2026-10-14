// Serves dist/ at the site base on a fixed port, for Lighthouse and manual checks. Usage: node scripts/serve.mjs [port]
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
const port = Number(process.argv[2] || 4173);
const base = (process.env.SITE_BASE || "/slop-editorial/").replace(/\/?$/, "/");
const dist = path.resolve("dist");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }).end(await readFile(path.join(dist, "robots.txt"))); return; }
  if (!p.startsWith(base)) { res.writeHead(302, { location: base }).end(); return; }
  p = p.slice(base.length);
  if (p === "" || p.endsWith("/")) p += "index.html"; else if (!path.extname(p)) p += "/index.html";
  try { res.writeHead(200, { "content-type": T[path.extname(p)] || "application/octet-stream", "cache-control": "no-cache" }).end(await readFile(path.join(dist, p))); }
  catch { res.writeHead(404, { "content-type": "text/html" }).end(await readFile(path.join(dist, "404.html")).catch(() => "404")); }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}${base}`));
