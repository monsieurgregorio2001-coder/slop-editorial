"""Generates the Slop Editorial wordmark as outlined SVG paths (no font needed at runtime).

Run once, commit the output:  python3 scripts/make-logo.py
Needs fontTools and brotli. Source face: Bricolage Grotesque (SIL OFL 1.1), see src/assets/fonts/OFL.txt.
Outputs: public/wordmark.svg (single colour, used as a CSS mask), public/logo.svg and public/favicon.svg (the mark).
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "src/assets/fonts/bricolage-grotesque-latin-wght-normal.woff2"


def outline(text: str, wght: int, size: float, x0: float, baseline: float, tracking: float = 0.0):
    font = TTFont(FONT)
    font = instancer.instantiateVariableFont(font, {"wght": wght, **{a.axisTag: a.defaultValue for a in font["fvar"].axes if a.axisTag != "wght"}})
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    s = size / upm
    x = x0
    d = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        tp = TransformPen(pen, (s, 0, 0, -s, x, baseline))
        gs[name].draw(tp)
        d.append(pen.getCommands())
        x += gs[name].width * s + tracking
    return " ".join(d), x


BLOB = "M32 12 C42 12 49 20 49 29.5 C49 36.5 45.5 41 41.5 44 C41.5 47 40.5 51 38 53 C35.5 55 31.5 54 31.5 51 C31.5 48.5 31.5 46.5 29.5 44.5 C25 42 15 37.5 15 29.5 C15 20 22 12 32 12 Z"

slop, x1 = outline("Slop", 800, 40, 0, 40, -0.4)
edit, x2 = outline("Editorial", 400, 40, x1 + 8, 40, 0.2)
width = round(x2)
(ROOT / "public/wordmark.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 52" width="{width}" height="52" role="img" aria-label="Slop Editorial">'
    f'<path fill="#000" d="{slop}"/><path fill="#000" d="{edit}"/></svg>\n'
)

mark = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6A3DFF"/><stop offset="1" stop-color="#3B1FD9"/></linearGradient>'
    '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4DDFF"/></linearGradient></defs>'
    '<rect width="64" height="64" rx="16" fill="url(#g)"/>'
    f'<path d="{BLOB}" fill="url(#b)"/>'
    '<ellipse cx="25" cy="21" rx="5.5" ry="3.4" fill="#fff" opacity=".9" transform="rotate(-28 25 21)"/>'
    '</svg>\n'
)
(ROOT / "public/logo.svg").write_text(mark)
(ROOT / "public/favicon.svg").write_text(mark)
print("wordmark width", width)
