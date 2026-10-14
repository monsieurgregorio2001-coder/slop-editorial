// Tiny static server for dist/, honouring SITE_BASE. Shared by verify.mjs and screenshots.mjs.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".woff2": "font/woff2", ".png": "image/png" };

export async function serveDist(dist, base) {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!p.startsWith(base)) { res.writeHead(404).end(); return; }
    p = p.slice(base.length);
    if (p === "" || p.endsWith("/")) p += "index.html";
    try {
      const body = await readFile(path.join(dist, p));
      res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }).end(body);
    } catch { res.writeHead(404, { "content-type": "text/html" }).end("<h1>404</h1>"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, origin: `http://127.0.0.1:${server.address().port}${base}` };
}
