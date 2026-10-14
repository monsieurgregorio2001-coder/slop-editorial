"""Build a review deck (PPTX and PDF) from slide text kept in a Markdown prompt pack.

The text is parsed from a fenced block of SLIDE entries and used verbatim: nothing is added,
reworded or summarised. Design: paper ground, ink text, one accent colour for slide titles,
a 4:5 image box on the left of image slides. Placeholders stay empty until an image is supplied.
"""
import io
import re
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR
from pptx.util import Emu, Inches, Pt
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from .errors import PlanError
from .pack import extract_prompt

PAPER, INK, ACCENT = "FAF8F4", "17171B", "2340B8"
W_IN, H_IN = 13.333, 7.5
IMG_X, IMG_Y, IMG_H = 0.6, 0.8, 5.9
IMG_W = IMG_H * 4 / 5
TXT_X_IMG = IMG_X + IMG_W + 0.5
TXT_X_FULL = 0.9
TXT_R = 12.8
TOP_TITLE, TOP_CONTENT = 2.7, 1.7


@dataclass
class Slide:
    number: int
    kind: str
    title: str
    body: list = field(default_factory=list)


def parse_slides(deck_markdown: str, heading: str):
    _, block = extract_prompt(deck_markdown, heading)
    lines = block.splitlines()
    slides, i = [], 0
    while i < len(lines):
        m = re.match(r"^SLIDE\s+(\d+)\s*\((.*?)\)\s*$", lines[i])
        if not m:
            i += 1
            continue
        num, kind = int(m.group(1)), m.group(2)
        i += 1
        chunk = []
        while i < len(lines) and lines[i].strip():
            chunk.append(lines[i].strip())
            i += 1
        if not chunk:
            raise PlanError(f"slide {num} has no text")
        if chunk[0].lower().startswith("title:"):
            title, body = chunk[0][6:].strip(), chunk[1:]
        else:
            title, body = chunk[0], chunk[1:]
        slides.append(Slide(num, kind, title, body))
    if not slides:
        raise PlanError("no SLIDE blocks found in deck prompt")
    return slides


# ---- shared layout ------------------------------------------------------------------------
def _wrap(text, font, size, width_pt):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if stringWidth(t, font, size) <= width_pt:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def fit_body(paragraphs, width_in, height_in, sizes=(22, 20, 18, 16, 15, 14, 13, 12, 11)):
    """Largest body size whose wrapped paragraphs fit the box. Returns (size, leading_factor)."""
    for s in sizes:
        total = 0
        for p in paragraphs:
            total += len(_wrap(p, "Helvetica", s, width_in * 72)) * s * 1.3 + s * 0.55
        if total <= height_in * 72:
            return s
    return sizes[-1]


def layout(slide, has_image_box):
    if slide.number == 1:
        return {"mode": "title", "x": TXT_X_FULL, "w": TXT_R - TXT_X_FULL}
    x = TXT_X_IMG if has_image_box else TXT_X_FULL
    return {"mode": "content", "x": x, "w": TXT_R - x}


def image_fit(path_or_bytes, box_w, box_h):
    """Contain inside the box without cropping. Returns (w, h) in the same units as the box."""
    im = Image.open(io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, bytes) else path_or_bytes)
    iw, ih = im.size
    s = min(box_w / iw, box_h / ih)
    return iw * s, ih * s


# ---- PPTX -------------------------------------------------------------------------------
def _rgb(h):
    return RGBColor.from_string(h)


def build_pptx(slides, images, placeholders, out_path):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(W_IN), Inches(H_IN)
    blank = prs.slide_layouts[6]
    for s in slides:
        sl = prs.slides.add_slide(blank)
        sl.background.fill.solid()
        sl.background.fill.fore_color.rgb = _rgb(PAPER)
        box = s.number in placeholders
        lay = layout(s, box)
        if box:
            _pptx_image_box(sl, images.get(s.number))
        _pptx_text(sl, s, lay)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    prs.save(out_path)
    return out_path


def _pptx_image_box(sl, img):
    if img:
        w, h = image_fit(img, IMG_W, IMG_H)
        x, y = IMG_X + (IMG_W - w) / 2, IMG_Y + (IMG_H - h) / 2
        sl.shapes.add_picture(io.BytesIO(img), Inches(x), Inches(y), Inches(w), Inches(h))
    else:
        shp = sl.shapes.add_shape(1, Inches(IMG_X), Inches(IMG_Y), Inches(IMG_W), Inches(IMG_H))
        shp.fill.background()
        shp.line.color.rgb = _rgb(INK)
        shp.line.width = Pt(0.75)
        shp.shadow.inherit = False
        shp.name = "Image placeholder 4:5"


def _pptx_text(sl, s, lay):
    title_pt = 96 if lay["mode"] == "title" else 40
    tb = sl.shapes.add_textbox(Inches(lay["x"]), Inches(0.75), Inches(lay["w"]), Inches(1.5 if lay["mode"] == "title" else 1.1))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = s.title
    r.font.name, r.font.size, r.font.color.rgb = "Georgia", Pt(title_pt), _rgb(ACCENT)
    top = TOP_TITLE if lay["mode"] == "title" else TOP_CONTENT
    body_h = H_IN - top - 0.7
    size = fit_body(s.body, lay["w"], body_h)
    bb = sl.shapes.add_textbox(Inches(lay["x"]), Inches(top), Inches(lay["w"]), Inches(body_h))
    bf = bb.text_frame
    bf.word_wrap = True
    for i, para in enumerate(s.body):
        p = bf.paragraphs[0] if i == 0 else bf.add_paragraph()
        p.space_after = Pt(size * 0.55)
        r = p.add_run()
        r.text = para
        r.font.name, r.font.size, r.font.color.rgb = "Calibri", Pt(size), _rgb(INK)


# ---- PDF --------------------------------------------------------------------------------
def build_pdf(slides, images, placeholders, out_path):
    heading_font = "Helvetica-Bold"
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out_path), pagesize=(W_IN * 72, H_IN * 72))
    c.setTitle("Slop Editorial review deck")
    for s in slides:
        c.setFillColorRGB(*_hex(PAPER))
        c.rect(0, 0, W_IN * 72, H_IN * 72, stroke=0, fill=1)
        box = s.number in placeholders
        lay = layout(s, box)
        if box:
            img = images.get(s.number)
            if img:
                w, h = image_fit(img, IMG_W, IMG_H)
                x, y = IMG_X + (IMG_W - w) / 2, IMG_Y + (IMG_H - h) / 2
                c.drawImage(ImageReader(io.BytesIO(img)), x * 72, (H_IN - y - h) * 72, w * 72, h * 72)
            else:
                c.setStrokeColorRGB(*_hex(INK))
                c.setLineWidth(0.75)
                c.rect(IMG_X * 72, (H_IN - IMG_Y - IMG_H) * 72, IMG_W * 72, IMG_H * 72, stroke=1, fill=0)
        title_pt = 96 if lay["mode"] == "title" else 40
        c.setFillColorRGB(*_hex(ACCENT))
        c.setFont(heading_font, title_pt)
        ty = H_IN - 0.75
        lead = title_pt * 1.05
        for ln in _wrap(s.title, heading_font, title_pt, lay["w"] * 72):
            ty -= lead / 72
            c.drawString(lay["x"] * 72, ty * 72, ln)
        top = TOP_TITLE if lay["mode"] == "title" else TOP_CONTENT
        body_h = H_IN - top - 0.7
        size = fit_body(s.body, lay["w"], body_h)
        c.setFillColorRGB(*_hex(INK))
        c.setFont("Helvetica", size)
        y = (H_IN - top) * 72
        for para in s.body:
            for ln in _wrap(para, "Helvetica", size, lay["w"] * 72):
                y -= size * 1.3
                c.drawString(lay["x"] * 72, y, ln)
            y -= size * 0.55
        c.showPage()
    c.save()
    return out_path


def _hex(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
