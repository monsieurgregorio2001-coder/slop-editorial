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
<g transform="translate(842 ${hz + 24}) scale(.9)"><rect x="-4" y="0" width="8" height="120" fill="#2a1a78"/><rect x="-86" y="-8" width="172" height="58" rx="10" fill="#fff4dc" stroke="#2a1a78" stroke-width="4"/>
<text x="0" y="22" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="20" fill="#2a1a78">SUNSEET POINT</text><text x="0" y="42" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="600" font-size="12" fill="#2a1a78">OPEN 24 HOURS OF HOURS</text><text x="0" y="-18" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="15" fill="#2a1a78">GIFT SHPO · COFEE</text></g>
<g transform="rotate(-8 150 545)"><circle cx="150" cy="545" r="72" fill="#fff" stroke="#14123a" stroke-width="4"/>${hand(150, 556, 0.19, 6)}<rect x="62" y="618" width="176" height="34" rx="17" fill="#ffe14d" stroke="#14123a" stroke-width="3"/><text x="150" y="642" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="17" fill="#14123a">FREE EXTRA FINGER</text></g>
${sphere(250, 930, 58, "#b8fff0", "#19d3c5")}${sphere(750, 930, 58, "#b8fff0", "#19d3c5")}
${sphere(380, 1070, 34, "#ffd1ea", "#ff4f9a")}${sphere(620, 1070, 34, "#ffd1ea", "#ff4f9a")}
${sphere(500, 1150, 22, "#fff0b8", "#f5b83a")}
${sphere(180, 380, 40, "#e0d4ff", "#7a4dff", false)}${sphere(820, 380, 40, "#e0d4ff", "#7a4dff", false)}
<ellipse cx="500" cy="${hz + 6}" rx="520" ry="16" fill="#fff" opacity=".2" filter="url(#blur8)"/>
${T(500, 1215, "ultra realistic, 8k, trending, masterpiece", 26, { anchor: "middle", fill: "#fff", mono: true, w: 500, op: 0.8 })}
<rect width="${W}" height="${H}" fill="url(#sheen)"/><rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>`;
}

const frame = (inner, bg1, bg2, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${defsCommon}<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>${extra}</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>${inner}<rect width="${W}" height="${H}" fill="url(#sheen)"/></svg>`;

// Shared pieces for the slop-trope scenes ----------------------------------------------------
const T = (x, y, str, size, o = {}) => `<text x="${x}" y="${y}" ${o.anchor ? `text-anchor="${o.anchor}"` : ""} font-family="${o.mono ? "monospace" : "Bricolage, sans-serif"}" font-weight="${o.w || 700}" font-size="${size}" fill="${o.fill || "#14123a"}" ${o.op ? `opacity="${o.op}"` : ""} ${o.ls ? `letter-spacing="${o.ls}"` : ""}>${str}</text>`;
const pill = (x, y, w, h, fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" ${extra}/>`;
/** The classic: a glossy yellow hand with one finger too many. n fingers, plus a thumb. */
const hand = (cx, cy, sc = 1, n = 6) => {
  const fw = 58, gap = 6, total = n * fw + (n - 1) * gap, x0 = -total / 2;
  const heights = [250, 320, 350, 340, 300, 240, 220];
  let fingers = "";
  for (let i = 0; i < n; i++) {
    const h = heights[Math.min(i, heights.length - 1)] * (i === n - 1 && n > 5 ? 0.9 : 1);
    const x = x0 + i * (fw + gap);
    fingers += `<rect x="${x}" y="${-h}" width="${fw}" height="${h + 90}" rx="${fw / 2}" fill="url(#skin)" stroke="#d99a00" stroke-width="4"/><rect x="${x + 12}" y="${-h + 16}" width="10" height="${h * 0.5}" rx="5" fill="#fff" opacity=".55"/>`;
  }
  return `<g transform="translate(${cx} ${cy}) scale(${sc})"><defs><linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#ffc21a"/></linearGradient></defs>
  <rect x="${x0 - 14}" y="40" width="${total + 28}" height="250" rx="110" fill="url(#skin)" stroke="#d99a00" stroke-width="4"/>
  <rect x="${x0 - 110}" y="120" width="190" height="62" rx="31" fill="url(#skin)" stroke="#d99a00" stroke-width="4" transform="rotate(38 ${x0 - 10} 150)"/>${fingers}</g>`;
};

// 2. Six Fingers, Five Stars
function sixFingers() {
  return frame(`${T(500, 150, "Made this with my hands", 62, { anchor: "middle", fill: "#fff", w: 800 })}
${hand(500, 760, 1.15, 6)}
${pill(120, 1040, 760, 150, "#fff", 'opacity=".95"')}
${T(160, 1100, "&#9733;&#9733;&#9733;&#9733;&#9733;  Amazing", 40, { fill: "#e0a000" })}${T(160, 1160, "Beautiful work   Wow   Amazing", 38, { fill: "#14123a", w: 600 })}`, "#6a3dff", "#19d3c5");
}

// 3. Certainly! Here is your image
function certainly() {
  return frame(`${pill(60, 70, 620, 90, "#f3f1fa")}${T(100, 130, "Certainly! Here is your image:", 36, { fill: "#14123a" })}
<rect x="60" y="190" width="880" height="660" rx="28" fill="url(#sky2)"/><circle cx="500" cy="620" r="150" fill="#ffd66b"/><rect x="60" y="640" width="880" height="210" fill="#3a1fa0" opacity=".8"/><path d="M60 640H940" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
${T(500, 800, "ultra realistic, 8k, trending, masterpiece", 33, { anchor: "middle", fill: "#fff", mono: true, w: 500 })}
${pill(60, 890, 420, 84, "#fff")}${T(270, 945, "&#8635; Regenerate response", 30, { anchor: "middle", fill: "#14123a", w: 600 })}${pill(500, 890, 180, 84, "#fff")}${T(590, 945, "Copy", 30, { anchor: "middle", fill: "#14123a", w: 600 })}
${T(60, 1070, "As an AI language model,", 44, { fill: "#fff", w: 700 })}${T(60, 1125, "I cannot tell if this is good.", 44, { fill: "#fff", w: 700 })}`, "#1b1458", "#3b1fd9", `<linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2fe0"/><stop offset=".7" stop-color="#ff4f9a"/><stop offset="1" stop-color="#ffb07a"/></linearGradient>`);
}

// 4. I am sorry, but I cannot fulfill this request: a product listing
function sorry() {
  return frame(`<rect x="60" y="60" width="880" height="1130" rx="30" fill="#fff"/>
<rect x="100" y="100" width="800" height="560" rx="20" fill="#eceaf7"/>
<path d="M330 260 H620 L600 560 q-8 40 -48 40 H398 q-40 0 -48 -40 Z" fill="#fff" stroke="#c9c4e8" stroke-width="6"/><path d="M620 320 q90 0 80 80 q-10 70 -100 56" fill="none" stroke="#fff" stroke-width="26"/><path d="M620 320 q90 0 80 80 q-10 70 -100 56" fill="none" stroke="#c9c4e8" stroke-width="6"/>
${T(475, 400, "COFFE LOVR", 40, { anchor: "middle", fill: "#ff4f9a", w: 800 })}${T(475, 450, "BESTT MOM EVR", 26, { anchor: "middle", fill: "#6a3dff", w: 700 })}
${T(100, 740, "I am sorry, but I cannot", 56, { fill: "#14123a", w: 800 })}${T(100, 805, "fulfill this request.", 56, { fill: "#14123a", w: 800 })}
${T(100, 880, "$19.99", 64, { fill: "#d1337a", w: 800 })}${T(330, 878, "&#9733;&#9733;&#9733;&#9733;&#9733; 4.8 (1,204)", 34, { fill: "#e0a000", w: 600 })}
${T(100, 950, "Free shipping. Only 3 left.", 36, { fill: "#4a4860", w: 500 })}
${pill(100, 1000, 380, 100, "#6a3dff")}${T(290, 1066, "Add to cart", 40, { anchor: "middle", fill: "#fff" })}${pill(510, 1000, 390, 100, "#ffe14d")}${T(705, 1066, "Best seller", 40, { anchor: "middle", fill: "#14123a" })}`, "#ff9a6a", "#ff4f9a");
}

// 5. Why do pictures like this never trend?
function neverTrend() {
  const rows = ["Amazing", "Beautiful work", "Amazing", "Wow", "Amazing"].map((c, i) => `<circle cx="120" cy="${905 + i * 64}" r="22" fill="${["#19d3c5", "#ff4f9a", "#ffd66b", "#6a3dff", "#13a46b"][i]}"/>${T(160, 915 + i * 64, c, 34, { fill: "#14123a", w: 600 })}`).join("");
  return frame(`<rect x="50" y="50" width="900" height="1150" rx="28" fill="#fff"/><circle cx="120" cy="125" r="40" fill="#ccc6ee"/>${pill(180, 100, 300, 26, "#14123a", 'opacity=".8"')}${pill(180, 140, 190, 18, "#14123a", 'opacity=".25"')}
${T(90, 235, "Why do pictures like this", 46, { fill: "#14123a", w: 800 })}${T(90, 290, "never trend?", 46, { fill: "#14123a", w: 800 })}
<rect x="90" y="320" width="820" height="440" rx="16" fill="url(#cab)"/><path d="M260 640 L500 400 L740 640 Z" fill="#7a3b2a"/><rect x="300" y="620" width="400" height="140" fill="#a8553a"/><rect x="340" y="660" width="70" height="100" fill="#ffd66b"/><rect x="450" y="650" width="90" height="70" fill="#ffd66b"/><rect x="580" y="650" width="90" height="70" fill="#ffefae"/>
<rect x="640" y="520" width="190" height="62" rx="8" fill="#fff4dc" stroke="#7a3b2a" stroke-width="4"/>${T(735, 560, "COZY CABBIN", 25, { anchor: "middle", fill: "#7a3b2a", w: 800 })}
${T(90, 830, "&#10084; 12.4k   Comments", 34, { fill: "#d1337a", w: 700 })}${rows}`, "#13a46b", "#0f2a8a", `<linearGradient id="cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2fe0"/><stop offset=".6" stop-color="#ff7aa8"/><stop offset="1" stop-color="#ffd0a0"/></linearGradient>`);
}

// 6. I am humbled to announce: a fourteen paragraph post
function humbled() {
  const lines = Array.from({ length: 14 }, (_, i) => pill(110, 380 + i * 50, [640, 560, 700, 300, 620, 680, 420, 660, 540, 700, 340, 600, 480, 640][i], 20, "#14123a", 'opacity=".22"')).join("");
  return frame(`<rect x="50" y="50" width="900" height="1150" rx="28" fill="#fff"/><circle cx="130" cy="130" r="42" fill="#ccc6ee"/>${pill(200, 105, 340, 26, "#14123a", 'opacity=".8"')}${pill(200, 148, 230, 18, "#14123a", 'opacity=".25"')}
${T(110, 280, "I am humbled to announce", 54, { fill: "#14123a", w: 800 })}${T(110, 340, "that nothing happened.", 54, { fill: "#14123a", w: 800 })}
${lines}${T(110, 1118, "The real lesson? B2B sales.", 44, { fill: "#d1337a", w: 800 })}${pill(710, 1078, 190, 70, "#4B2BFF")}${T(805, 1126, "Agree?", 38, { anchor: "middle", fill: "#fff" })}`, "#2b1f86", "#6a3dff");
}

// 7. Delve into the tapestry
function delve() {
  const dashes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${90 + i * 100}" y="1100" width="76" height="14" rx="3" fill="#fff" opacity=".92"/>`).join("");
  return frame(`${T(500, 120, "In today&#8217;s fast-paced world", 44, { anchor: "middle", fill: "#fff", w: 600 })}
${T(500, 360, "DELVE", 190, { anchor: "middle", fill: "#ffe14d", w: 800 })}${T(500, 560, "TAPESTRY", 150, { anchor: "middle", fill: "#ff4f9a", w: 800 })}${T(500, 760, "TESTAMENT", 138, { anchor: "middle", fill: "#19d3c5", w: 800 })}
${T(500, 920, "Let us dive in.", 82, { anchor: "middle", fill: "#fff", w: 700 })}${T(500, 1040, "40 em dashes per paragraph", 40, { anchor: "middle", fill: "#fff", w: 600, op: 0.85 })}${dashes}`, "#14123a", "#6a3dff");
}

// 8. Make it pop: one more variation, a bigger logo
function pop() {
  let g = ""; const scales = [0.22, 0.34, 0.5, 0.72, 1, 1.5];
  scales.forEach((sc, i) => {
    const x = 70 + (i % 2) * 450, y = 170 + Math.floor(i / 2) * 340;
    g += `<g><clipPath id="c${i}"><rect x="${x}" y="${y}" width="410" height="300" rx="18"/></clipPath><rect x="${x}" y="${y}" width="410" height="300" rx="18" fill="#fff"/><g clip-path="url(#c${i})"><g transform="translate(${x + 205} ${y + 150}) scale(${sc})"><circle r="95" fill="#4B2BFF"/>${T(0, 14, "LOGO", 44, { anchor: "middle", fill: "#fff", w: 800 })}</g></g>${T(x + 14, y + 34, "v" + (i + 1), 26, { fill: "#14123a", w: 700, op: 0.7 })}</g>`;
  });
  return frame(`${T(500, 110, "One more variation", 62, { anchor: "middle", fill: "#fff", w: 800 })}${g}${T(500, 1215, "&#8220;Can you make the logo bigger?&#8221;", 40, { anchor: "middle", fill: "#14123a", w: 700 })}`, "#ff9a6a", "#ffe14d");
}

const works = { "hero-still": hero(), "work-fingers": sixFingers(), "work-certainly": certainly(), "work-sorry": sorry(), "work-trend": neverTrend(), "work-humbled": humbled(), "work-delve": delve(), "work-pop": pop() };

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
