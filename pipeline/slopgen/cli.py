"""slopgen command line. Run `slopgen --help` or `python -m slopgen --help`."""
import argparse
import sys
from pathlib import Path

from . import __version__
from .deck import build_pdf, build_pptx, parse_slides
from .errors import SlopError
from .http import Http
from .pack import load_plan
from .providers import ORDER, REGISTRY, make_provider
from .review import build_review
from .runner import Runner
from .secrets import has_secret
from .store import Store

PKG = Path(__file__).resolve().parent.parent
DEFAULT_PLAN = PKG / "plans" / "ai-and-taste.yaml"
RUNS = PKG / "runs"


def _common(p):
    p.add_argument("--plan", default=str(DEFAULT_PLAN))
    p.add_argument("--root", help="project root (auto-detected)")
    p.add_argument("--provider", default="mock", choices=list(REGISTRY), help="default: mock (free, offline)")
    p.add_argument("--runs-dir", default=str(RUNS))
    p.add_argument("--only", help="comma-separated prompt ids, e.g. P1,P2")
    p.add_argument("--include-optional", action="store_true", help="also run prompts marked optional")


def _setup(a, need_http=True):
    plan = load_plan(a.plan, a.root)
    provider = make_provider(a.provider, http=Http() if need_http else None)
    store = Store(a.runs_dir, plan.name)
    return plan, provider, store, Runner(plan, provider, store)


def _only(a):
    return set(a.only.split(",")) if getattr(a, "only", None) else None


def cmd_plan(a):
    plan, provider, store, runner = _setup(a, need_http=False)
    jobs = runner.plan_jobs(_only(a), a.include_optional)
    print(f"plan {plan.name} | provider {provider.name} | {plan.width}x{plan.height} | {plan.candidates} candidates per prompt")
    print(f"{'job':8} {'state':9} {'model':34} {'est $':>6}  refs")
    for j in jobs:
        est = j.estimate_usd if j.state != "blocked" else provider.estimate_usd(j.route, plan.width, plan.height)
        print(f"{j.prompt_id + ' c' + str(j.candidate):8} {j.state:9} {j.route.model[:34]:34} {est:6.3f}  {', '.join(j.ref_labels) or '-'}")
        for w in j.warnings:
            print(f"{'':8} ! {w}")
    total = runner.estimate_total(jobs)
    print(f"\nestimated new spend: ${total:.2f} on {provider.name} (planning figure; the provider invoice governs)")
    print(f"already spent in this run directory (estimate): ${store.spent_estimate():.2f}")
    return 0


def cmd_run(a):
    plan, provider, store, runner = _setup(a)
    s = runner.run(_only(a), a.include_optional, a.max_usd, a.yes, a.approval_ref, retry_uncertain=a.retry_uncertain)
    print("summary:", s)
    return 0 if not s["failed"] else 2


def cmd_select(a):
    plan, provider, store, runner = _setup(a, need_http=False)
    stale = runner.select(a.prompt, a.candidate)
    print(f"{a.prompt}: candidate {a.candidate} selected")
    if stale:
        print(f"downstream prompts that use it as a reference will regenerate on the next run: {', '.join(stale)}")
    return 0


def cmd_review(a):
    plan, provider, store, runner = _setup(a, need_http=False)
    out = Path(a.out or store.dir / "review.html")
    build_review(plan, store, provider.name, out, runner.selected_record, runner.current_candidates)
    print("wrote", out)
    return 0


def cmd_deck(a):
    plan, provider, store, runner = _setup(a, need_http=False)
    if not plan.deck:
        raise SlopError("plan has no deck section")
    slides = parse_slides(plan.deck["markdown"], plan.deck["heading"])
    images, missing = {}, []
    for slide_no, pid in (plan.deck.get("images") or {}).items():
        rec, _prov = runner.selected_record(pid)
        if rec is None:
            missing.append(f"slide {slide_no} <- {pid}")
        else:
            images[int(slide_no)] = store.image_path(rec).read_bytes()
    out = Path(a.out_dir or store.dir / "deck")
    out.mkdir(parents=True, exist_ok=True)
    placeholders = set(plan.deck.get("placeholder_slides") or [])
    pptx = build_pptx(slides, images, placeholders, out / "review-deck.pptx")
    pdf = build_pdf(slides, images, placeholders, out / "review-deck.pdf")
    print("wrote", pptx)
    print("wrote", pdf)
    if missing:
        print("placeholders left empty (no finished image yet):", "; ".join(missing))
    return 0


def cmd_all(a):
    rc = cmd_run(a)
    cmd_review(argparse.Namespace(**{**vars(a), "out": None}))
    cmd_deck(argparse.Namespace(**{**vars(a), "out_dir": None}))
    return rc


def cmd_doctor(a):
    plan = load_plan(a.plan, a.root)
    print(f"slopgen {__version__} | plan {plan.name}: {len(plan.prompts)} prompts parsed, all references resolve")
    print("  mock       no key needed")
    for name in ORDER:
        prov = make_provider(name)
        print(f"  {name:10} key {prov.secret_env}: {'found' if has_secret(prov.secret_env) else 'MISSING'}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="slopgen", description="prompt pack -> provider APIs -> review sheet -> deck, with spend gates")
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def paid(p):
        p.add_argument("--retry-uncertain", action="store_true", help="explicitly resubmit an unresolved request after checking provider history; may charge again")
        p.add_argument("--yes", action="store_true", help="confirm the estimated spend")
        p.add_argument("--approval-ref", help="reference to the recorded human approval for this spend")
        p.add_argument("--max-usd", type=float, default=5.0, help="hard cap on estimated spend (default 5.00)")

    p = sub.add_parser("plan", help="show jobs, cache state and estimated cost; spends nothing")
    _common(p); p.set_defaults(fn=cmd_plan)

    p = sub.add_parser("run", help="generate candidates (paid unless --provider mock)")
    _common(p); paid(p); p.set_defaults(fn=cmd_run)

    p = sub.add_parser("select", help="choose the candidate that later prompts use as a reference")
    _common(p); p.add_argument("prompt"); p.add_argument("candidate", type=int); p.set_defaults(fn=cmd_select)

    p = sub.add_parser("review", help="write the HTML contact sheet")
    _common(p); p.add_argument("--out"); p.set_defaults(fn=cmd_review)

    p = sub.add_parser("deck", help="assemble the PPTX and PDF from selected candidates")
    _common(p); p.add_argument("--out-dir"); p.set_defaults(fn=cmd_deck)

    p = sub.add_parser("all", help="run, review sheet and deck in one go")
    _common(p); paid(p); p.set_defaults(fn=cmd_all)

    p = sub.add_parser("doctor", help="check the plan parses and which API keys are present")
    p.add_argument("--plan", default=str(DEFAULT_PLAN)); p.add_argument("--root"); p.set_defaults(fn=cmd_doctor)

    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except SlopError as e:
        print(f"slopgen: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
