"""Self-contained HTML contact sheet for the human selection step. Local file, images inline."""
import base64
import html

REJECT = [
    "Readable text, logo, screen or watermark anywhere in the frame",
    "Anatomy or object errors that distract from the idea (hands, glass, signage)",
    "Style drift from the first selected frame in the series",
    "Looks like a near-copy of an existing, recognisable work",
    "Beautiful but says nothing: no point of view, no reason to publish",
]


def build_review(plan, store, provider_name, out_path, selected_for, candidates_for=None):
    """selected_for(pid) -> (record|None, provisional bool)."""
    rows = []
    for p in plan.prompts:
        cands = candidates_for(p.id) if candidates_for else store.done_candidates(p.id, provider_name)
        if not cands:
            continue
        sel, prov = selected_for(p.id)
        cells = []
        for r in cands:
            b64 = base64.b64encode(store.image_path(r).read_bytes()).decode()
            mark = " selected" if sel and sel["candidate"] == r["candidate"] else ""
            tag = ("provisional (auto, candidate 1)" if prov else "selected") if mark else ""
            cells.append(
                f'<figure class="c{mark}"><img src="data:image/png;base64,{b64}" alt="{html.escape(p.id)} candidate {r["candidate"]}">'
                f'<figcaption>{html.escape(p.id)} · candidate {r["candidate"]} · seed {r["seed"]}<br>'
                f'refs: {html.escape(", ".join(r["refs"]) or "none")}<br>{tag}'
                f'<br><code>slopgen select {html.escape(p.id)} {r["candidate"]}</code></figcaption></figure>')
        rows.append(f'<section><h2>{html.escape(p.title)}</h2><div class="row">{"".join(cells)}</div></section>')
    doc = f"""<!doctype html><meta charset="utf-8"><title>{html.escape(plan.name)} · review</title>
<style>
body{{background:#17171B;color:#FAF8F4;font:15px/1.4 Helvetica,Arial,sans-serif;margin:24px}}
h1{{color:#FAF8F4;font-weight:700}} h2{{border-top:1px solid #51607a;padding-top:14px;font-size:16px}}
.row{{display:flex;gap:16px;flex-wrap:wrap}} figure{{margin:0;width:300px}} img{{width:100%;display:block;border:3px solid transparent}}
.selected img{{border-color:#2340B8}} figcaption{{font-size:12px;color:#bbb;margin-top:6px}} code{{color:#FAF8F4}}
.note{{max-width:760px;color:#bbb}}
</style>
<h1>REVIEW CANDIDATES · nothing here is approved</h1>
<p class="note">Generated candidates for the human editor's selection. Not approved, captioned or cleared for publication.
Reject for: </p><ul class="note">{"".join(f"<li>{html.escape(x)}</li>" for x in REJECT)}</ul>
{"".join(rows) or "<p>No finished candidates yet.</p>"}"""
    from pathlib import Path
    Path(out_path).write_text(doc, encoding="utf-8")
    return out_path
