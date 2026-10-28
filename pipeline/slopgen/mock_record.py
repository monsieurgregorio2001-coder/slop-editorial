"""The committed record of one run with the free mock provider.

    python -m slopgen.mock_record            run the pipeline with the mock provider and write site/src/data/mock-run.json
    python -m slopgen.mock_record --check    exit 1 when a fresh run disagrees with the committed record (timestamps ignored)

Nothing here spends money or calls a network. The mock provider draws placeholder frames, and the run directory is
a temporary folder that is deleted afterwards. The record keeps the plan table, the estimate, the cap, the approval
reference and the ledger lines the run wrote.
"""
import json
import sys
import tempfile
from pathlib import Path

from .pack import load_plan
from .providers import make_provider
from .runner import Runner
from .store import Store
from .spend import price_table

PKG = Path(__file__).resolve().parent.parent
PLAN = PKG / "plans" / "ai-and-taste.yaml"
SITE_DATA = PKG.parent / "site" / "src" / "data"
OUT = SITE_DATA / "mock-run.json"
PRICES = SITE_DATA / "spend-prices.json"
CAP = 5.0
APPROVAL_REF = "MOCK-REF-001"


def record():
    plan = load_plan(PLAN, PKG)
    with tempfile.TemporaryDirectory() as tmp:
        provider = make_provider("mock")
        store = Store(tmp, plan.name)
        runner = Runner(plan, provider, store)
        jobs = runner.plan_jobs()
        table = [{"job": f"{j.prompt_id} c{j.candidate}", "state": j.state, "model": j.route.model,
                  "estimate_usd": j.estimate_usd if j.state != "blocked" else provider.estimate_usd(j.route, plan.width, plan.height),
                  "refs": j.ref_labels} for j in jobs]
        estimate = runner.estimate_total(jobs)
        summary = runner.run(max_usd=CAP, approval_ref=APPROVAL_REF, progress=lambda *_: None)
        lines = [json.loads(x) for x in (Path(tmp) / plan.name / "ledger.jsonl").read_text().splitlines()]
    keep = lambda e: {k: v for k, v in e.items() if k in ("t", "event", "provider", "approval_ref", "estimate", "only", "done", "cached", "filtered", "failed", "spent_estimate")}
    return {
        "schema": 1,
        "command": f"python -m slopgen run --provider mock --approval-ref {APPROVAL_REF} --max-usd {CAP:.2f}",
        "provider": "mock",
        "plan": {"name": plan.name, "width": plan.width, "height": plan.height, "candidates": plan.candidates, "prompts": [p.id for p in plan.prompts if not p.optional]},
        "jobs": table,
        "estimate_usd": estimate,
        "cap_usd": CAP,
        "approval_ref": APPROVAL_REF,
        "approval_note": "The mock provider is free, so no approval was needed. The reference is passed only to show where the ledger records it.",
        "ledger": [keep(e) for e in lines if e["event"] in ("run_started", "run_finished")],
        "summary": summary,
        "ledger_events": len(lines),
    }


def prices():
    plan = load_plan(PLAN, PKG)
    return {"schema": 1, "width": plan.width, "height": plan.height, "rows": price_table(plan.width, plan.height)}


def strip_times(rec):
    rec = json.loads(json.dumps(rec))
    for e in rec["ledger"]:
        e.pop("t", None)
    return rec


def dump(obj):
    return json.dumps(obj, indent=2) + "\n"


def main(argv):
    if "--check" in argv:
        ok = True
        if not OUT.exists() or strip_times(json.loads(OUT.read_text())) != strip_times(record()):
            print(f"{OUT} disagrees with a fresh mock run"); ok = False
        if not PRICES.exists() or PRICES.read_text() != dump(prices()):
            print(f"{PRICES} disagrees with the price table"); ok = False
        return 0 if ok else 1
    SITE_DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(dump(record()))
    PRICES.write_text(dump(prices()))
    print(f"wrote {OUT} and {PRICES}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
