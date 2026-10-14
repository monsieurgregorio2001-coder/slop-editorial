// Generates every raster image on the site from code: art-directed SVG scenes with a
// deliberate "too perfect" stock-AI look. Renders with headless Chrome, encodes with sharp.
// Usage: node scripts/make-art.mjs   (outputs are committed under public/img)
import { chromium } from "playwright-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/img");
const CHROME = process.env.CHROMIUM_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FONT = path.resolve("src/assets/fonts/bricolage-grotesque-latin-wght-normal.woff2");
await mkdir(OUT, { recursive: true });

const W = 1000, H = 1250;
const defsCommon = `
<radialGradient id="sph" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="#fff" stop-opacity=".25"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
<filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="blur20"><feGaussianBlur stdDeviation="20"/></filter>
<filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>`;

let uid = 0;
/** A glossy plastic sphere with specular highlight and soft contact shadow. */
const sphere = (cx, cy, r, c1, c2, shadow = true) => {
  const id = `s${uid++}`;
  return `<defs><radialGradient id="${id}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
${shadow ? `<ellipse cx="${cx}" cy="${cy + r * 1.35}" rx="${r * 0.9}" ry="${r * 0.14}" fill="#000" opacity=".28" filter="url(#blur8)"/>` : ""}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sph)"/>
<ellipse cx="${cx - r * 0.34}" cy="${cy - r * 0.46}" rx="${r * 0.3}" ry="${r * 0.17}" fill="#fff" opacity=".85" transform="rotate(-30 ${cx - r * 0.34} ${cy - r * 0.46})"/>`;
};
const star = (x, y, r, o = 0.9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
const rnd = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// 1. Hero: an impossible sunset, mirrored lake, symmetric peaks, plastic spheres, a sign with wrong letters.
function hero() {
  const hz = 700, cx = 500;
  const r = rnd(7);
  let stars = "";
  for (let i = 0; i < 60; i++) stars += star(r() * W, r() * 380, 0.8 + r() * 1.4, 0.4 + r() * 0.5);
  const peaks = (fill, y, hgt, n, seed) => {
    const q = rnd(seed); let pts = []; const half = [];
    for (let i = 0; i <= n; i++) half.push([(i / n) * 500, y - hgt * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + seed))) * (i % 2 ? 0.55 : 1)]);
    const left = half.map(([x, yy]) => [x, yy]);
    const right = half.slice().reverse().map(([x, yy]) => [W - x, yy]);
    pts = [[0, hz], ...left, ...right, [W, hz]];
    q();
    return `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${fill}"/>`;
  };
  const scene = `
  <rect width="${W}" height="${hz}" fill="url(#sky)"/>
  ${stars}
  <circle cx="${cx}" cy="${hz - 20}" r="420" fill="url(#halo)" />
  <circle cx="${cx}" cy="${hz - 20}" r="230" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
  <circle cx="${cx}" cy="${hz - 20}" r="300" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
  <circle cx="${cx}" cy="${hz - 20}" r="170" fill="url(#sun)"/>
  ${peaks("url(#far)", hz, 190, 8, 3)}
  ${peaks("url(#near)", hz, 120, 6, 5)}
  <path d="M0 ${hz} H${W}" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`;
  const birds = [[360, 360], [300, 410], [420, 420], [240, 460], [340, 480]].map(([x, y]) => `<path d="M${x - 14} ${y} q14 -14 14 0 q0 -14 14 0" fill="none" stroke="#14123a" stroke-width="3" stroke-linecap="round"/><path d="M${W - x - 14} ${y} q14 -14 14 0 q0 -14 14 0" fill="none" stroke="#14123a" stroke-width="3" stroke-linecap="round"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${defsCommon}
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15124d"/><stop offset=".32" stop-color="#5a2fe0"/><stop offset=".62" stop-color="#ff4f9a"/><stop offset=".88" stop-color="#ffb07a"/><stop offset="1" stop-color="#ffe3a8"/></linearGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset=".35" stop-color="#ff9ab8" stop-opacity=".45"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></radialGradient>
<radialGradient id="sun" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fffbe8"/><stop offset=".6" stop-color="#ffd66b"/><stop offset="1" stop-color="#ff8a5c"/></radialGradient>
<linearGradient id="far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c4cd8"/><stop offset="1" stop-color="#b86ad0"/></linearGradient>
<linearGradient id="near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1f86"/><stop offset="1" stop-color="#5c2fa8"/></linearGradient>
<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb07a"/><stop offset=".3" stop-color="#d45ab0"/><stop offset="1" stop-color="#2a1a78"/></linearGradient>
<clipPath id="top"><rect width="${W}" height="${hz}"/></clipPath>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0b0830" stop-opacity=".5"/></radialGradient>
</defs>
<g clip-path="url(#top)">${scene}</g>
<rect y="${hz}" width="${W}" height="${H - hz}" fill="url(#lake)"/>
<g transform="translate(0 ${hz * 2}) scale(1 -1)" opacity=".55" filter="url(#blur3)"><g clip-path="url(#top)">${scene}</g></g>
<rect y="${hz}" width="${W}" height="${H - hz}" fill="url(#lake)" opacity=".35"/>
${Array.from({ length: 16 }, (_, i) => `<rect x="${120 + (i % 2) * 40}" y="${hz + 30 + i * 32}" width="${760 - (i % 2) * 80}" height="2" fill="#fff" opacity="${0.18 - i * 0.008}" rx="1"/>`).join("")}
${birds}
<g transform="translate(150 ${hz + 120})"><rect x="-4" y="0" width="8" height="120" fill="#2a1a78"/><rect x="-86" y="-8" width="172" height="58" rx="10" fill="#fff4dc" stroke="#2a1a78" stroke-width="4"/>
<text x="0" y="22" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="20" fill="#2a1a78">SUNSEET POINT</text><text x="0" y="42" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="600" font-size="12" fill="#2a1a78">OPEN 24 HOURS OF HOURS</text></g>
${sphere(250, 930, 58, "#b8fff0", "#19d3c5")}${sphere(750, 930, 58, "#b8fff0", "#19d3c5")}
${sphere(380, 1070, 34, "#ffd1ea", "#ff4f9a")}${sphere(620, 1070, 34, "#ffd1ea", "#ff4f9a")}
${sphere(500, 1150, 22, "#fff0b8", "#f5b83a")}
${sphere(180, 380, 40, "#e0d4ff", "#7a4dff", false)}${sphere(820, 380, 40, "#e0d4ff", "#7a4dff", false)}
<ellipse cx="500" cy="${hz + 6}" rx="520" ry="16" fill="#fff" opacity=".2" filter="url(#blur8)"/>
<rect width="${W}" height="${H}" fill="url(#sheen)"/><rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>`;
}

const frame = (inner, bg1, bg2, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${defsCommon}<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>${extra}</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>${inner}<rect width="${W}" height="${H}" fill="url(#sheen)"/></svg>`;

// 2. Ten Thousand Sunsets: a grid of identical sunsets, one very slightly different.
function sunsets() {
  let t = ""; const cols = 5, rows = 7, pad = 40, gw = (W - pad * 2 - (cols - 1) * 16) / cols, gh = gw * 1.1;
  for (let i = 0; i < cols * rows; i++) {
    const x = pad + (i % cols) * (gw + 16), y = 90 + Math.floor(i / cols) * (gh + 14);
    const odd = i === 17;
    t += `<g><rect x="${x}" y="${y}" width="${gw}" height="${gh}" rx="14" fill="url(#t)"/><circle cx="${x + gw / 2}" cy="${y + gh * 0.62}" r="${gw * 0.2}" fill="${odd ? "#fff1b8" : "#ffd66b"}"/><rect x="${x}" y="${y + gh * 0.62}" width="${gw}" height="${gh * 0.38}" rx="0" fill="#3a1fa0" opacity=".75"/><path d="M${x} ${y + gh * 0.62}H${x + gw}" stroke="#fff" stroke-opacity=".4"/></g>`;
  }
  return frame(`${t}<text x="500" y="62" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="34" fill="#fff" opacity=".92">10,000 / 10,000 GENERATED</text>`, "#1b1458", "#6a3dff", `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2fe0"/><stop offset=".6" stop-color="#ff4f9a"/><stop offset="1" stop-color="#ffb07a"/></linearGradient>`);
}

// 3. The Engagement Plateau: glossy chart, wrong axes.
function plateau() {
  const pts = [[110, 1000], [240, 880], [370, 700], [500, 520], [630, 400], [760, 392], [890, 390]];
  const d = pts.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  const bars = [0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${80 + i * 130}" y="${1060 - (i < 5 ? 160 + i * 150 : 780)}" width="62" height="${i < 5 ? 160 + i * 150 : 780}" rx="31" fill="#fff" opacity=".13"/>`).join("");
  return frame(`${bars}
<path d="${d}" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>
${pts.map(([x, y], i) => sphere(x, y, i > 4 ? 26 : 22, "#ffe9a8", "#ff8a5c", false)).join("")}
<g font-family="Bricolage, sans-serif" font-weight="700" fill="#fff" opacity=".9"><text x="70" y="1130" font-size="26">MON</text><text x="330" y="1130" font-size="26">TUE</text><text x="590" y="1130" font-size="26">MONDAY</text><text x="800" y="1130" font-size="26">VIBES</text>
<text x="70" y="140" font-size="64" font-weight="800">+18 %</text><text x="70" y="190" font-size="26" font-weight="500">compared with the previous +18 %</text></g>
<rect x="70" y="1170" width="860" height="3" fill="#fff" opacity=".4"/>`, "#0f2a8a", "#19d3c5");
}

// 4. Productivity Theatre: a symmetric desk, thirteen hour clock, perpetual in progress.
function theatre() {
  const tick = Array.from({ length: 13 }, (_, i) => { const a = (i / 13) * Math.PI * 2 - Math.PI / 2; return `<line x1="${500 + Math.cos(a) * 118}" y1="${230 + Math.sin(a) * 118}" x2="${500 + Math.cos(a) * 138}" y2="${230 + Math.sin(a) * 138}" stroke="#14123a" stroke-width="6" stroke-linecap="round"/>`; }).join("");
  const rows = ["Align on alignment", "Circle back", "Synergy review", "Plan the planning"].map((t, i) => `<rect x="300" y="${590 + i * 62}" width="30" height="30" rx="8" fill="#19d3c5"/><path d="M308 ${606 + i * 62} l7 7 l11 -14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="350" y="${614 + i * 62}" font-family="Bricolage, sans-serif" font-weight="600" font-size="28" fill="#14123a">${t}</text><rect x="700" y="${598 + i * 62}" width="${i === 3 ? 50 : 90}" height="14" rx="7" fill="#ffb07a"/>`).join("");
  const plant = (x) => `<rect x="${x - 36}" y="900" width="72" height="90" rx="16" fill="#fff"/>${[-1, 0, 1].map((k) => `<ellipse cx="${x + k * 34}" cy="${850 - Math.abs(k) * 0}" rx="20" ry="64" fill="#13a46b" transform="rotate(${k * 22} ${x + k * 34} 900)"/>`).join("")}`;
  return frame(`
<circle cx="500" cy="230" r="150" fill="#fff"/>${tick}<line x1="500" y1="230" x2="500" y2="140" stroke="#14123a" stroke-width="9" stroke-linecap="round"/><line x1="500" y1="230" x2="560" y2="262" stroke="#6a3dff" stroke-width="7" stroke-linecap="round"/><circle cx="500" cy="230" r="12" fill="#ff4f9a"/>
<rect x="240" y="500" width="520" height="330" rx="24" fill="#14123a"/><rect x="262" y="522" width="476" height="286" rx="10" fill="#fff"/>${rows}
<path d="M180 850 H820 L860 890 H140 Z" fill="#c7bfe8"/><rect x="100" y="890" width="800" height="40" rx="12" fill="#e9e3ff"/>
<rect x="100" y="930" width="800" height="300" fill="#fff" opacity=".14"/>
${plant(150)}${plant(850)}
<rect x="445" y="860" width="110" height="80" rx="18" fill="#ff4f9a"/><path d="M555 880 q50 10 0 50" stroke="#ff4f9a" stroke-width="14" fill="none"/>
${sphere(110, 520, 26, "#ffe9a8", "#f5b83a", false)}${sphere(890, 520, 26, "#ffe9a8", "#f5b83a", false)}
<text x="500" y="1130" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="44" fill="#fff" opacity=".95">IN PROGRESS</text>`, "#2a1a78", "#ff4f9a");
}

// 5. Certified Authentic: gold rosette with ribbons.
function certified() {
  const n = 36; let rose = "";
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; rose += `<circle cx="${500 + Math.cos(a) * 270}" cy="${520 + Math.sin(a) * 270}" r="40" fill="url(#gold)"/>`; }
  return frame(`
<path d="M360 760 L300 1180 L400 1110 L470 1190 L500 780Z" fill="url(#rib)"/><path d="M640 760 L700 1180 L600 1110 L530 1190 L500 780Z" fill="url(#rib)"/>
${rose}<circle cx="500" cy="520" r="270" fill="url(#gold)"/><circle cx="500" cy="520" r="225" fill="none" stroke="#7a5a12" stroke-opacity=".5" stroke-width="5"/><circle cx="500" cy="520" r="160" fill="url(#gold2)"/>
<path d="M410 520 l66 70 l120 -140" stroke="#fff6d6" stroke-width="40" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path id="arc" d="M290 520 a210 210 0 0 1 420 0" fill="none"/><text font-family="Bricolage, sans-serif" font-weight="800" font-size="34" letter-spacing="6" fill="#6b4a0c"><textPath href="#arc" startOffset="50%" text-anchor="middle">CERTIFIED AUTHENTIC</textPath></text>
<path id="arc2" d="M290 520 a210 210 0 0 0 420 0" fill="none"/><text font-family="Bricolage, sans-serif" font-weight="800" font-size="30" letter-spacing="6" fill="#6b4a0c"><textPath href="#arc2" startOffset="50%" text-anchor="middle">GENUINELY SYNTHETIC</textPath></text>
<ellipse cx="410" cy="360" rx="120" ry="40" fill="#fff" opacity=".35" transform="rotate(-30 410 360)"/>`, "#14123a", "#3b1fd9",
    `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="#e5b13a"/><stop offset="1" stop-color="#a8761a"/></linearGradient><linearGradient id="gold2" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#e5b13a"/><stop offset="1" stop-color="#b8841f"/></linearGradient><linearGradient id="rib" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4f9a"/><stop offset="1" stop-color="#b3206a"/></linearGradient>`);
}

// 6. Recommended For You: a recursion of the same recommendation.
function loopArt() {
  let t = "";
  for (let i = 0; i < 9; i++) {
    const s = 1 - i * 0.11, w = 860 * s, h = 1080 * s, x = 500 - w / 2, y = 625 - h / 2;
    const hues = ["#6a3dff", "#8a4dff", "#c94fd0", "#ff4f9a", "#ff7a8a", "#ff9a6a", "#ffb07a", "#ffd0a0", "#ffe9c8"];
    t += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${40 * s}" fill="${hues[i]}" stroke="#fff" stroke-opacity=".5" stroke-width="3"/><text x="${x + 30 * s}" y="${y + 48 * s}" font-family="Bricolage, sans-serif" font-weight="700" font-size="${30 * s}" fill="#fff" opacity=".9">Because you viewed this</text>`;
  }
  return frame(t + sphere(500, 640, 46, "#fff0b8", "#f5b83a", false), "#0f0c3a", "#2b1f86");
}

// 7. The Quiet Feed: four cards that are all the same card.
function feedArt() {
  const card = (y, hue) => `<rect x="150" y="${y}" width="700" height="250" rx="30" fill="#fff"/><rect x="190" y="${y + 36}" width="178" height="178" rx="22" fill="${hue}"/>${sphere(279, y + 125, 42, "#fff", hue, false)}<rect x="400" y="${y + 50}" width="380" height="22" rx="11" fill="#14123a" opacity=".85"/><rect x="400" y="${y + 92}" width="300" height="14" rx="7" fill="#14123a" opacity=".25"/><rect x="400" y="${y + 120}" width="340" height="14" rx="7" fill="#14123a" opacity=".25"/><text x="400" y="${y + 195}" font-family="Bricolage, sans-serif" font-weight="800" font-size="34" fill="#ff4f9a">★ 4.2</text><text x="500" y="${y + 195}" font-family="Bricolage, sans-serif" font-weight="600" font-size="24" fill="#14123a" opacity=".6">same as before</text>`;
  return frame(`${card(150, "#7a4dff")}${card(430, "#7a4dff")}${card(710, "#7a4dff")}${card(990, "#7a4dff")}<text x="500" y="100" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="40" fill="#fff">YOU ARE ALL CAUGHT UP</text>`, "#19d3c5", "#0f2a8a");
}

// 8. Synthetic Candid: two cups, mirrored, a bokeh field, a caption that says unposed.
function candid() {
  const r = rnd(11); let bokeh = "";
  for (let i = 0; i < 26; i++) bokeh += `<circle cx="${r() * W}" cy="${r() * 760}" r="${20 + r() * 50}" fill="#fff" opacity="${0.06 + r() * 0.12}" filter="url(#blur3)"/>`;
  const cup = (x, flip) => `<g transform="translate(${x} 780) scale(${flip} 1)"><path d="M-120 -170 H120 L100 90 q-10 40 -50 40 H-50 q-40 0 -50 -40 Z" fill="#fff"/><ellipse cx="0" cy="-170" rx="120" ry="28" fill="#d9c4a8"/><ellipse cx="0" cy="-170" rx="104" ry="20" fill="#7a4a2a"/><path d="M118 -120 q70 0 60 60 q-10 50 -80 40" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round"/><path d="M-70 -120 v150" stroke="#ff4f9a" stroke-width="16" stroke-linecap="round" opacity=".7"/></g>`;
  return frame(`${bokeh}${cup(330, 1)}${cup(670, -1)}
<path d="M500 560 l-14 -40 l28 0 Z" fill="#ffe9a8"/>${star(500, 500, 6)}${star(470, 520, 3)}${star(530, 520, 3)}
<rect x="260" y="1010" width="480" height="84" rx="42" fill="#fff"/><text x="500" y="1066" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="40" fill="#14123a">UNPOSED</text>`, "#ff9a6a", "#6a3dff");
}

const works = { "hero-still": hero(), "work-sunsets": sunsets(), "work-plateau": plateau(), "work-theatre": theatre(), "work-certified": certified(), "work-loop": loopArt(), "work-feed": feedArt(), "work-candid": candid() };

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.2 });
const fontCss = `@font-face{font-family:Bricolage;font-weight:200 800;src:url(data:font/woff2;base64,${(await readFile(FONT)).toString("base64")}) format("woff2")}`;
const sizes = [480, 800, 1000];
const manifest = {};
for (const [name, svg] of Object.entries(works)) {
  await writeFile(path.join(OUT, `${name}.svg`), svg);
  await page.setContent(`<style>${fontCss} html,body{margin:0;background:#000}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
  for (const w of sizes) await sharp(png).resize({ width: w }).webp({ quality: name === "hero-still" ? 80 : 74 }).toFile(path.join(OUT, `${name}-${w}.webp`));
  manifest[name] = sizes;
  console.log("art", name);
}
await browser.close();
// The source SVGs stay in art-src/ (not shipped); public keeps only the WebP derivatives.
const { rename, mkdir: mk, readdir } = await import("node:fs/promises");
await mk(path.resolve("art-src"), { recursive: true });
for (const f of await readdir(OUT)) if (f.endsWith(".svg")) await rename(path.join(OUT, f), path.resolve("art-src", f));
await writeFile(path.resolve("art-src/manifest.json"), JSON.stringify(manifest, null, 2));
