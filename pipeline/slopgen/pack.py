"""Read a run plan (YAML) and the markdown prompt sources it points at.

The markdown files stay the single source of truth for prompt wording. The plan
only says which headings to run, which shared blocks to expand, what each prompt
needs as reference images, and which images go on which slide.
"""
import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .errors import PlanError

FENCE = re.compile(r"```text\n(.*?)```", re.S)


@dataclass
class Ref:
    file: str = None   # project-relative path
    chain: str = None  # prompt id whose selected candidate is used


@dataclass
class PromptSpec:
    id: str
    title: str
    text: str            # fully expanded
    refs: list = field(default_factory=list)
    optional: bool = False
    est_tokens: int = 0


@dataclass
class Plan:
    name: str
    root: Path
    seed: int
    candidates: int
    width: int
    height: int
    prompts: list
    deck: dict
    sources: dict

    def prompt(self, pid):
        for p in self.prompts:
            if p.id == pid:
                return p
        raise PlanError(f"unknown prompt id {pid}")

    @property
    def aspect(self):
        return self.width / self.height


def _section(md: str, heading_prefix: str) -> str:
    """Text from the `###` heading starting with heading_prefix to the next heading of level <= 3."""
    lines = md.splitlines()
    start = None
    for i, ln in enumerate(lines):
        m = re.match(r"(#{2,3}) (.*)", ln)
        if m and m.group(2).startswith(heading_prefix):
            start = i
            break
    if start is None:
        raise PlanError(f"heading starting {heading_prefix!r} not found")
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if re.match(r"#{1,3} ", lines[j]):
            end = j
            break
    return "\n".join(lines[start:end])


def extract_prompt(md: str, heading_prefix: str):
    sec = _section(md, heading_prefix)
    title = sec.splitlines()[0].lstrip("# ").strip()
    m = FENCE.search(sec)
    if not m:
        raise PlanError(f"no ```text block under heading {heading_prefix!r}")
    return title, m.group(1).strip()


def extract_block(md: str, marker: str) -> str:
    i = md.find(marker)
    if i < 0:
        raise PlanError(f"block marker {marker!r} not found")
    m = FENCE.search(md, i)
    if not m:
        raise PlanError(f"no ```text block after {marker!r}")
    return m.group(1).strip()


def expand_blocks(text: str, blocks: dict) -> str:
    for name, body in blocks.items():
        text = re.sub(r"^\[" + re.escape(name) + r"\]\s*$", lambda _m, b=body: b, text, flags=re.M | re.I)
    left = re.findall(r"^\[[^\]]+\]\s*$", text, flags=re.M)
    if left:
        raise PlanError(f"unexpanded placeholder(s) in prompt: {left}")
    return text


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def load_plan(plan_path, root=None) -> Plan:
    plan_path = Path(plan_path)
    root = Path(root) if root else _find_root(plan_path)
    raw = yaml.safe_load(plan_path.read_text(encoding="utf-8"))
    try:
        sources = {k: (root / v) for k, v in raw["sources"].items()}
        mds = {k: p.read_text(encoding="utf-8") for k, p in sources.items()}
    except (KeyError, OSError) as e:
        raise PlanError(f"plan sources unreadable: {e}") from e

    blocks = {}
    for name, spec in (raw.get("blocks") or {}).items():
        blocks[name] = extract_block(mds[spec["source"]], spec["after"])

    prompts, seen = [], set()
    for p in raw["prompts"]:
        if p["id"] in seen:
            raise PlanError(f"duplicate prompt id {p['id']}")
        seen.add(p["id"])
        title, text = extract_prompt(mds[p["source"]], p["heading"])
        text = expand_blocks(text, blocks)
        refs = []
        for r in p.get("refs") or []:
            if "file" in r:
                if not (root / r["file"]).is_file():
                    raise PlanError(f"{p['id']}: reference file {r['file']} not found")
                refs.append(Ref(file=r["file"]))
            elif "chain" in r:
                refs.append(Ref(chain=r["chain"]))
            else:
                raise PlanError(f"{p['id']}: ref needs file: or chain:")
        prompts.append(PromptSpec(
            id=p["id"], title=p.get("title") or title, text=text, refs=refs,
            optional=bool(p.get("optional")), est_tokens=int(len(text.split()) * 1.35),
        ))
    ids = {p.id for p in prompts}
    for p in prompts:
        for r in p.refs:
            if r.chain and (r.chain not in ids or _index(prompts, r.chain) >= _index(prompts, p.id)):
                raise PlanError(f"{p.id}: chain ref {r.chain} must name an earlier prompt in the plan")

    deck = raw.get("deck") or {}
    if deck:
        deck = dict(deck)
        deck["markdown"] = mds[deck["source"]]
        for pid in (deck.get("images") or {}).values():
            if pid not in ids:
                raise PlanError(f"deck image names unknown prompt {pid}")

    w, h = raw.get("size", [1024, 1280])
    return Plan(name=raw["name"], root=root, seed=int(raw.get("seed", 1)),
                candidates=int(raw.get("candidates", 2)), width=w, height=h,
                prompts=prompts, deck=deck, sources=sources)


def _index(prompts, pid):
    return [p.id for p in prompts].index(pid)


def _find_root(plan_path: Path) -> Path:
    for parent in [plan_path.resolve(), *plan_path.resolve().parents]:
        if (parent / "prompts").is_dir() and (parent / "plans").is_dir():
            return parent
    raise PlanError("project root not found (looked for a folder holding prompts/ and plans/); pass --root")
