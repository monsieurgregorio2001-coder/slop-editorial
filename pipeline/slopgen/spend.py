"""The spend gate as pure functions: the price table, the estimate, and the cap check.

`Runner.run` calls `refusal` and prints nothing of its own, so the strings below are the CLI's strings.
The site's "spend cap" toy is a TypeScript port of this file. `python -m slopgen.spend_fixtures` writes the
fixtures both sides must agree on, and CI fails when the two differ.
"""
import math

from .errors import SlopError
from .providers import REGISTRY

MSG_CAP_INVALID = "--max-usd must be a finite, non-negative amount"
MSG_NO_APPROVAL = "paid runs need --approval-ref naming the recorded human approval"


def msg_need_yes(total, provider):
    return f"estimated spend ${total:.2f} on {provider}; rerun with --yes to proceed"


def msg_over_cap(total, cap):
    return f"estimated ${total:.2f} exceeds --max-usd {cap:.2f}; raise the cap or narrow with --only"


def validate_cap(cap):
    if not math.isfinite(cap) or cap < 0:
        raise SlopError(MSG_CAP_INVALID)


def price_table(width, height):
    """One row per route of every provider, with the per-image estimate the planner would use at this size."""
    rows = []
    for name in REGISTRY:
        provider = REGISTRY[name]()
        for route in provider.routes():
            rows.append({"provider": name, "model": route.model, "mode": route.mode,
                         "usd": provider.estimate_usd(route, width, height), "free": bool(getattr(provider, "free", False))})
    return rows


def planned_total(per_image, jobs):
    """Same arithmetic as Runner.estimate_total: a sum of per-job estimates, rounded to four places."""
    return round(sum([per_image] * jobs), 4)


def refusal(total, cap, provider, free, yes, approval_ref):
    """The message `slopgen run` would raise for these flags, or None when the run may start."""
    if not math.isfinite(cap) or cap < 0:
        return MSG_CAP_INVALID
    if free:
        return None
    if not yes:
        return msg_need_yes(total, provider)
    if not approval_ref:
        return MSG_NO_APPROVAL
    if total > cap:
        return msg_over_cap(total, cap)
    return None


def evaluate(total, cap, provider, free):
    """What the toy shows. Run as if --yes and --approval-ref were both given.
    Over the cap: the CLI's refusal. Under it: the requirements the CLI still enforces, in its own words."""
    over = refusal(total, cap, provider, free, True, "APPROVAL-REF")
    if over:
        return {"refused": True, "message": over, "requirements": []}
    if free:
        return {"refused": False, "message": "", "requirements": []}
    return {"refused": False, "message": "",
            "requirements": [refusal(total, cap, provider, free, False, None), refusal(total, cap, provider, free, True, None)]}
