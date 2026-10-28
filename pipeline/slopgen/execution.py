"""Persistent request lifecycle. Unknown outcomes never silently submit a second job."""
from .spend import validate_cap  # noqa: F401  (re-exported: the cap check lives in spend.py)


def record_state(rec):
    if not rec:
        return "new"
    if rec.get("status") in ("done", "filtered"):
        return "cached"
    if rec.get("handle"):
        return "resume"
    # Includes legacy failed jobs: they may already have incurred a charge.
    return "uncertain"


def begin_attempt(store, fp, base, resume=False):
    previous = store.job(fp) or {}
    reserved = previous.get("reserved_usd", previous.get("estimate_usd", 0))
    if not resume:
        reserved += base["estimate_usd"]
    base = {**base, "reserved_usd": reserved}
    if resume:
        base["handle"] = previous["handle"]
        base["approval_ref"] = previous.get("approval_ref", base.get("approval_ref"))
    store.save_job(fp, {**base, "status": "submitted" if resume else "submitting"})
    store.log("request_resumed" if resume else "request_started", **base)
    return base


def record_failure(store, fp, base, error):
    latest = store.job(fp) or {}
    handle = latest.get("handle")
    store.save_job(fp, {**base, "status": "submitted" if handle else "uncertain",
                        "handle": handle, "error": str(error)[:500]})
